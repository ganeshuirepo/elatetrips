/**
 * RateCardService — the M17 use-case layer. It orchestrates the pure pipeline
 * (validate → diff → decide) over the injected repository, sheet provider, audit
 * store and config; it holds no persistence detail and no business literal
 * (BR-17). Every state change appends an audit event (BR-6).
 *
 * Flow (FR17.1–17.3):
 *   validate → invalid rows never land, partner notified with cell refs
 *           → valid rows: band on the BASELINE + cumulative-drift guard
 *             → within band & no drift  ⇒ auto-apply (append to the ledger)
 *             → beyond band OR drift     ⇒ stage a proposal for ops review
 * Approving a staged proposal APPENDS a new applied row (append-only ledger).
 * A booking snapshots the rate live at booking time via snapshotRate().
 */
import { randomUUID } from 'node:crypto';
import { NotFoundError, UnprocessableEntityError } from '../../common/errors/AppError';
import type { RatecardConfig } from './ratecard.config';
import type { IRateRowRepository, StagedFilter } from './ratecard.repository';
import type { ISheetProvider } from './ratecard.sheets';
import type { RatecardAuditStore } from './ratecard.audit';
import { freshness as computeFreshness } from './ratecard.freshness';
import { resolveSlabs } from './ratecard.tolerance';
import { decideIngestion, validateRow } from './ratecard.pipeline';
import type {
  FreshnessResult,
  IngestSummary,
  NormalizedRow,
  RateRow,
  RateSource,
  RawSheetRow,
  StagedProposal,
} from './ratecard.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RateCardDeps {
  repo: IRateRowRepository;
  sheets: ISheetProvider;
  audit: RatecardAuditStore;
  config: RatecardConfig;
  now?: () => Date;
}

export class RateCardService {
  private readonly repo: IRateRowRepository;
  private readonly sheets: ISheetProvider;
  private readonly audit: RatecardAuditStore;
  private readonly config: RatecardConfig;
  private readonly now: () => Date;

  constructor(deps: RateCardDeps) {
    this.repo = deps.repo;
    this.sheets = deps.sheets;
    this.audit = deps.audit;
    this.config = deps.config;
    this.now = deps.now ?? ((): Date => new Date());
  }

  private iso(): string {
    return this.now().toISOString();
  }

  private driftWindowStart(): Date | null {
    const days = this.config.drift_window_days;
    if (days === undefined) return null;
    return new Date(this.now().getTime() - days * MS_PER_DAY);
  }

  // ---- Ingestion (FR17.1/17.3) --------------------------------------------

  /** Pull a partner's owned sheet through the provider, then ingest. */
  async ingestFromSheet(partner_id: string): Promise<IngestSummary> {
    const rows = await this.sheets.fetchRows(partner_id);
    return this.ingest(partner_id, rows, 'sheet');
  }

  /**
   * Ingest a batch of raw rows for a partner. Rows are attributed to
   * `partner_id` regardless of any partner_id in the payload, so a partner's
   * sheet can never write another partner's rates.
   */
  async ingest(partner_id: string, raw: RawSheetRow[], source: RateSource): Promise<IngestSummary> {
    const summary: IngestSummary = { partner_id, applied: [], staged: [], rejected: [] };
    const invalidErrors: IngestSummary['rejected'][number]['errors'] = [];

    for (const rawRow of raw) {
      const scoped: RawSheetRow = { ...rawRow, partner_id };
      const result = validateRow(scoped);
      if (!result.valid) {
        summary.rejected.push({ cell: scoped.cell, errors: result.errors });
        invalidErrors.push(...result.errors);
        this.audit.append({
          type: 'ratecard.row_rejected',
          actor: 'system',
          actor_id: 'system',
          role: 'platform',
          subject: { partner_id, sku: rawRow.sku },
          payload: { partner_id, cell: scoped.cell, errors: result.errors, source },
        });
        continue; // invalid rows never land
      }
      const decided = await this.decideAndPersist(result.row, source);
      if (decided.kind === 'applied') summary.applied.push(decided.row);
      else summary.staged.push(decided.proposal);
    }

    // Notify the partner of every invalid cell in one pass (FR17.1).
    if (invalidErrors.length > 0) await this.sheets.notifyInvalid(partner_id, invalidErrors);

    return summary;
  }

  private async decideAndPersist(
    row: NormalizedRow,
    source: RateSource,
  ): Promise<{ kind: 'applied'; row: RateRow } | { kind: 'staged'; proposal: StagedProposal }> {
    const baseline = await this.repo.latestApplied(row.partner_id, row.sku);
    const history = (await this.repo.appliedForSku(row.partner_id, row.sku)).map((r) => ({
      price_minor: r.price.amount,
      ts: r.ingested_ts,
    }));
    const slabs = resolveSlabs(this.config, row.destination);

    const decision = decideIngestion({
      baseline,
      incomingMinor: row.price.amount,
      driftHistory: history,
      driftWindowStart: this.driftWindowStart(),
      slabs,
      defaultPct: this.config.default_pct,
      meta: { partner_id: row.partner_id, destination: row.destination, sku: row.sku },
    });

    if (decision.reason === 'cumulative_drift') {
      this.audit.append({
        type: 'ratecard.drift_flagged',
        actor: 'system',
        actor_id: 'system',
        role: 'platform',
        subject: { partner_id: row.partner_id, sku: row.sku },
        payload: {
          partner_id: row.partner_id,
          sku: row.sku,
          drift: decision.drift,
          incoming_minor: row.price.amount,
        },
      });
    }

    if (decision.action === 'apply') {
      const applied = await this.appendApplied(row, source, baseline?.row_id, {
        tolerance: decision.tolerance,
      });
      return { kind: 'applied', row: applied };
    }

    const proposal = await this.stageProposal(row, decision.reason ?? 'beyond_band', decision, baseline?.row_id);
    return { kind: 'staged', proposal };
  }

  private async appendApplied(
    row: NormalizedRow,
    source: RateSource,
    supersedes: string | undefined,
    extra: Record<string, unknown>,
  ): Promise<RateRow> {
    const rateRow: RateRow = {
      row_id: `rc_${randomUUID().slice(0, 8)}`,
      partner_id: row.partner_id,
      destination: row.destination,
      sku: row.sku,
      price: row.price,
      effective_from: row.effective_from,
      schema_version: row.schema_version,
      source,
      ingested_ts: this.iso(),
      cell: row.cell,
      ...(row.effective_to !== undefined ? { effective_to: row.effective_to } : {}),
      ...(supersedes !== undefined ? { supersedes_row_id: supersedes } : {}),
    };
    const saved = await this.repo.append(rateRow);
    this.audit.append({
      type: 'ratecard.row_applied',
      actor: 'system',
      actor_id: 'system',
      role: 'platform',
      subject: { partner_id: saved.partner_id, sku: saved.sku, row_id: saved.row_id },
      after: { price: saved.price, effective_from: saved.effective_from },
      payload: {
        partner_id: saved.partner_id,
        sku: saved.sku,
        row_id: saved.row_id,
        price_minor: saved.price.amount,
        source,
        supersedes_row_id: supersedes,
        ...extra,
      },
    });
    return saved;
  }

  private async stageProposal(
    row: NormalizedRow,
    reason: StagedProposal['reason'],
    decision: { tolerance: StagedProposal['tolerance']; drift: StagedProposal['drift'] },
    baselineRowId: string | undefined,
  ): Promise<StagedProposal> {
    const proposal: StagedProposal = {
      proposal_id: `rcs_${randomUUID().slice(0, 8)}`,
      partner_id: row.partner_id,
      destination: row.destination,
      sku: row.sku,
      incoming: row,
      reason,
      tolerance: decision.tolerance,
      drift: decision.drift,
      status: 'pending',
      created_ts: this.iso(),
      ...(baselineRowId !== undefined ? { baseline_row_id: baselineRowId } : {}),
    };
    const saved = await this.repo.addStaged(proposal);
    this.audit.append({
      type: 'ratecard.row_staged',
      actor: 'system',
      actor_id: 'system',
      role: 'platform',
      subject: { partner_id: saved.partner_id, sku: saved.sku, proposal_id: saved.proposal_id },
      payload: {
        partner_id: saved.partner_id,
        sku: saved.sku,
        proposal_id: saved.proposal_id,
        reason,
        tolerance: saved.tolerance,
        incoming_minor: row.price.amount,
      },
    });
    return saved;
  }

  // ---- Staged review ------------------------------------------------------

  listStaged(filter: StagedFilter): Promise<StagedProposal[]> {
    return this.repo.listStaged(filter);
  }

  /** Approve a staged proposal — APPENDS a new applied row (append-only). */
  async approveStaged(proposal_id: string, actor_id: string): Promise<RateRow> {
    const proposal = await this.requireStaged(proposal_id);
    if (proposal.status !== 'pending') {
      throw new UnprocessableEntityError(`Proposal already ${proposal.status}`);
    }
    const applied = await this.appendApplied(proposal.incoming, 'manual_upload', proposal.baseline_row_id, {
      approved_from_proposal: proposal_id,
    });
    await this.repo.updateStaged({
      ...proposal,
      status: 'approved',
      resolved_ts: this.iso(),
      resolved_by: actor_id,
    });
    this.audit.append({
      type: 'ratecard.staged_approved',
      actor: 'ops',
      actor_id,
      role: 'ops',
      subject: { partner_id: proposal.partner_id, sku: proposal.sku, proposal_id, row_id: applied.row_id },
      payload: { proposal_id, row_id: applied.row_id, approved_by: actor_id },
    });
    return applied;
  }

  async rejectStaged(proposal_id: string, actor_id: string, note?: string): Promise<StagedProposal> {
    const proposal = await this.requireStaged(proposal_id);
    if (proposal.status !== 'pending') {
      throw new UnprocessableEntityError(`Proposal already ${proposal.status}`);
    }
    const rejected = await this.repo.updateStaged({
      ...proposal,
      status: 'rejected',
      resolved_ts: this.iso(),
      resolved_by: actor_id,
      ...(note !== undefined ? { resolved_note: note } : {}),
    });
    this.audit.append({
      type: 'ratecard.staged_rejected',
      actor: 'ops',
      actor_id,
      role: 'ops',
      subject: { partner_id: proposal.partner_id, sku: proposal.sku, proposal_id },
      payload: { proposal_id, rejected_by: actor_id, note },
    });
    return rejected;
  }

  // ---- Freshness (FR17.2) -------------------------------------------------

  /**
   * Freshness for a partner. Emits `ratecard.partner_stale` when a configured
   * threshold is breached, so M19/M20 can suspend pool membership and
   * auto-confirm eligibility off the audit stream.
   */
  async getFreshness(partner_id: string): Promise<FreshnessResult> {
    const last = await this.repo.lastFreshRow(partner_id);
    const result = computeFreshness(partner_id, last?.ingested_ts ?? null, this.config.freshness_threshold_days, this.now());
    if (result.stale) {
      this.audit.append({
        type: 'ratecard.partner_stale',
        actor: 'system',
        actor_id: 'system',
        role: 'platform',
        subject: { partner_id },
        payload: { partner_id, score_days: result.score_days, threshold_days: result.threshold_days },
      });
    }
    return result;
  }

  // ---- Booking-time snapshot (FR17.2) -------------------------------------

  /**
   * The applied rate live for a SKU at a given date — what a booking snapshots.
   * Later sheet edits append new rows but never change this one, so a booking
   * keeps the rate it was made against.
   */
  async snapshotRate(partner_id: string, sku: string, on: string): Promise<RateRow> {
    const row = await this.repo.rateEffectiveAt(partner_id, sku, on);
    if (!row) throw new NotFoundError(`No applied rate for ${partner_id}/${sku} effective ${on}`);
    this.audit.append({
      type: 'ratecard.snapshot_taken',
      actor: 'system',
      actor_id: 'system',
      role: 'platform',
      subject: { partner_id, sku, row_id: row.row_id },
      payload: { partner_id, sku, row_id: row.row_id, on, price_minor: row.price.amount },
    });
    return row;
  }

  /** All applied rows for a SKU (audit / ops inspection). */
  listRows(partner_id: string, sku: string): Promise<RateRow[]> {
    return this.repo.appliedForSku(partner_id, sku);
  }

  private async requireStaged(proposal_id: string): Promise<StagedProposal> {
    const proposal = await this.repo.getStaged(proposal_id);
    if (!proposal) throw new NotFoundError(`Staged proposal not found: ${proposal_id}`);
    return proposal;
  }
}
