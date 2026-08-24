/**
 * Rate-row persistence behind an interface (Dependency Inversion). The applied
 * ledger is EFFECTIVE-DATED and APPEND-ONLY (FR17.2): `append` is the only way a
 * row enters it and rows are never mutated — a correction is a new row that
 * supersedes the previous. Staged proposals are a separate, mutable review queue
 * (pending → approved/rejected); approving one APPENDS a new applied row rather
 * than editing the ledger.
 *
 * The in-memory implementation ships now (mock-first, matching the contracts
 * host). A Mongoose-backed implementation can be dropped in at the container with
 * no change to the service, which depends only on this interface.
 */
import type { RateRow, StagedProposal } from './ratecard.types';

export interface StagedFilter {
  partner_id?: string;
  sku?: string;
  status?: StagedProposal['status'];
}

export interface IRateRowRepository {
  // --- applied ledger (append-only) ---
  append(row: RateRow): Promise<RateRow>;
  getRow(row_id: string): Promise<RateRow | undefined>;
  /** All applied rows for a SKU, chronological by ingestion. */
  appliedForSku(partner_id: string, sku: string): Promise<RateRow[]>;
  /** The live baseline: latest applied row for a SKU by ingestion time. */
  latestApplied(partner_id: string, sku: string): Promise<RateRow | undefined>;
  /** The applied row effective at a given date — the booking-time snapshot. */
  rateEffectiveAt(partner_id: string, sku: string, on: string): Promise<RateRow | undefined>;
  /** Latest applied row for a partner across all SKUs — drives freshness. */
  lastFreshRow(partner_id: string): Promise<RateRow | undefined>;

  // --- staged proposals (review queue) ---
  addStaged(proposal: StagedProposal): Promise<StagedProposal>;
  getStaged(proposal_id: string): Promise<StagedProposal | undefined>;
  listStaged(filter: StagedFilter): Promise<StagedProposal[]>;
  updateStaged(proposal: StagedProposal): Promise<StagedProposal>;
}

export class InMemoryRateRowRepository implements IRateRowRepository {
  private readonly rows: RateRow[] = [];
  private readonly staged = new Map<string, StagedProposal>();

  async append(row: RateRow): Promise<RateRow> {
    // Freeze to make the append-only invariant enforced at runtime, not just by
    // convention: a booking can snapshot this row and trust it never changes.
    const frozen = Object.freeze({ ...row, price: Object.freeze({ ...row.price }) });
    this.rows.push(frozen);
    return frozen;
  }

  async getRow(row_id: string): Promise<RateRow | undefined> {
    return this.rows.find((r) => r.row_id === row_id);
  }

  async appliedForSku(partner_id: string, sku: string): Promise<RateRow[]> {
    return this.rows
      .filter((r) => r.partner_id === partner_id && r.sku === sku)
      .sort((a, b) => a.ingested_ts.localeCompare(b.ingested_ts));
  }

  async latestApplied(partner_id: string, sku: string): Promise<RateRow | undefined> {
    const all = await this.appliedForSku(partner_id, sku);
    return all[all.length - 1];
  }

  async rateEffectiveAt(partner_id: string, sku: string, on: string): Promise<RateRow | undefined> {
    // The row whose effective window contains `on`; when several qualify, the one
    // ingested latest wins (a later correction supersedes an earlier row).
    const candidates = (await this.appliedForSku(partner_id, sku)).filter(
      (r) => r.effective_from <= on && (r.effective_to === undefined || on <= r.effective_to),
    );
    return candidates[candidates.length - 1];
  }

  async lastFreshRow(partner_id: string): Promise<RateRow | undefined> {
    return this.rows
      .filter((r) => r.partner_id === partner_id)
      .sort((a, b) => a.ingested_ts.localeCompare(b.ingested_ts))
      .pop();
  }

  async addStaged(proposal: StagedProposal): Promise<StagedProposal> {
    this.staged.set(proposal.proposal_id, proposal);
    return proposal;
  }

  async getStaged(proposal_id: string): Promise<StagedProposal | undefined> {
    return this.staged.get(proposal_id);
  }

  async listStaged(filter: StagedFilter): Promise<StagedProposal[]> {
    return Array.from(this.staged.values()).filter((p) => {
      if (filter.partner_id && p.partner_id !== filter.partner_id) return false;
      if (filter.sku && p.sku !== filter.sku) return false;
      if (filter.status && p.status !== filter.status) return false;
      return true;
    });
  }

  async updateStaged(proposal: StagedProposal): Promise<StagedProposal> {
    this.staged.set(proposal.proposal_id, proposal);
    return proposal;
  }
}
