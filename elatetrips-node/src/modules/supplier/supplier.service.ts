/**
 * SupplierService — the M3 use-case layer between the controller and the
 * repository. It owns onboarding, the vetting/activation gate (FR3.5/3.10/3.11),
 * the declared-TAT floor (FR3.9), the cap policy (FR3.3), quality tiering
 * (FR3.4), the re-acceptance gate (FR3.10) and the read APIs (directory +
 * candidate query, FR3.8). All thresholds come from injected config (BR-17); all
 * decision logic is delegated to the pure functions in `supplier.rules`; every
 * state change emits an audit event (BR-6).
 */
import { randomUUID } from 'node:crypto';
import {
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../common/errors/AppError';
import type { ISupplierRepository } from './supplier.repository';
import type { ISupplierAudit, Role } from './supplier.audit';
import { capForDestination, type SupplierConfig } from './supplier.config';
import {
  activationBlockers,
  checkTatFloor,
  compareCandidates,
  decideCapSlot,
  requiresReacceptance,
  resolveQualityTier,
} from './supplier.rules';
import type {
  CandidateQuery,
  CandidateRow,
  CapDecision,
  ContractAcceptance,
  CreateSupplierInput,
  Supplier,
  SupplierContractView,
  UpdateSupplierInput,
} from './supplier.types';

/** Maps a supplier's track to the audit `role` used in events. */
function roleOf(supplier: Pick<Supplier, 'track' | 'type'>): Role {
  if (supplier.type === 'dmc') return 'dmc';
  if (supplier.type === 'hotel') return 'hotel';
  return 'provider';
}

export class SupplierService {
  constructor(
    private readonly repo: ISupplierRepository,
    private readonly config: SupplierConfig,
    private readonly audit: ISupplierAudit,
    private readonly actorId = 'system',
  ) {}

  /** Project the internal record onto the frozen `supplier.schema.json` view. */
  private static toContractView(s: Supplier): SupplierContractView {
    return {
      supplier_id: s.supplier_id,
      type: s.type,
      name: s.name,
      destinations: s.destinations,
      track: s.track,
      ...(s.tier ? { tier: s.tier } : {}),
      declared_tat_hours: s.declared_tat_hours,
      contract_accepted: s.contract_accepted,
      ...(s.comms_consent ? { comms_consent: s.comms_consent } : {}),
    };
  }

  private async getOrThrow(supplierId: string): Promise<Supplier> {
    const found = await this.repo.findBySupplierId(supplierId);
    if (!found) throw new NotFoundError(`Supplier not found: ${supplierId}`);
    return found;
  }

  // ---- FR3.1 / FR3.11 onboarding -------------------------------------------

  /** Invite/create a supplier (import or manual add). Starts in `invited`. */
  async invite(input: CreateSupplierInput): Promise<SupplierContractView> {
    if (await this.repo.findBySupplierId(input.supplier_id)) {
      throw new ConflictError(`Supplier already exists: ${input.supplier_id}`);
    }
    // TAT floor is enforced at entry (AC: "TAT below 2h rejected at entry").
    const tatIssue = checkTatFloor(input.declared_tat_hours, this.config.tat_floor_hours);
    if (tatIssue) throw new UnprocessableEntityError(tatIssue);

    const now = new Date().toISOString();
    const record: Supplier = {
      supplier_id: input.supplier_id,
      type: input.type,
      name: input.name,
      destinations: input.destinations,
      track: input.track,
      declared_tat_hours: input.declared_tat_hours,
      contract_accepted: false,
      status: 'invited',
      channel_pref: input.channel_pref ?? 'email',
      ...(input.comms_consent ? { comms_consent: input.comms_consent } : {}),
      ...(input.contacts ? { contacts: input.contacts } : {}),
      ...(input.vetting ? { vetting: input.vetting } : {}),
      created_ts: now,
      updated_ts: now,
    };
    const created = await this.repo.create(record);
    this.audit.append({
      type: 'supplier.invited',
      actor: 'ops',
      actor_id: this.actorId,
      role: roleOf(created),
      subject: { supplier_id: created.supplier_id },
      after: SupplierService.toContractView(created) as unknown as Record<string, unknown>,
      payload: { track: created.track, destinations: created.destinations },
    });
    return SupplierService.toContractView(created);
  }

  /** Manual edit (FR3.1). Re-derives quality tier when a scorecard is supplied. */
  async update(supplierId: string, patch: UpdateSupplierInput): Promise<SupplierContractView> {
    const before = await this.getOrThrow(supplierId);
    if (patch.declared_tat_hours !== undefined) {
      const tatIssue = checkTatFloor(patch.declared_tat_hours, this.config.tat_floor_hours);
      if (tatIssue) throw new UnprocessableEntityError(tatIssue);
    }
    const next: Partial<Supplier> = { ...patch, updated_ts: new Date().toISOString() };
    if (patch.scorecard) {
      next.quality_tier = resolveQualityTier(patch.scorecard, this.config.tier_thresholds);
    }
    const updated = await this.repo.update(supplierId, next);
    if (!updated) throw new NotFoundError(`Supplier not found: ${supplierId}`);
    this.audit.append({
      type: 'supplier.updated',
      actor: 'ops',
      actor_id: this.actorId,
      role: roleOf(updated),
      subject: { supplier_id: supplierId },
      before: SupplierService.toContractView(before) as unknown as Record<string, unknown>,
      after: SupplierService.toContractView(updated) as unknown as Record<string, unknown>,
      payload: { changed: Object.keys(patch) },
    });
    return SupplierService.toContractView(updated);
  }

  // ---- FR3.9 declared TAT ---------------------------------------------------

  /** Declare/renegotiate the quote turnaround. Rejects below the platform floor. */
  async declareTat(supplierId: string, hours: number): Promise<SupplierContractView> {
    const before = await this.getOrThrow(supplierId);
    const tatIssue = checkTatFloor(hours, this.config.tat_floor_hours);
    if (tatIssue) throw new UnprocessableEntityError(tatIssue);
    const updated = await this.repo.update(supplierId, {
      declared_tat_hours: hours,
      updated_ts: new Date().toISOString(),
    });
    if (!updated) throw new NotFoundError(`Supplier not found: ${supplierId}`);
    this.audit.append({
      type: 'supplier.tat.declared',
      actor: 'supplier',
      actor_id: supplierId,
      role: roleOf(updated),
      subject: { supplier_id: supplierId },
      before: { declared_tat_hours: before.declared_tat_hours },
      after: { declared_tat_hours: hours },
    });
    return SupplierService.toContractView(updated);
  }

  // ---- FR3.10 e-acceptance (clickwrap) -------------------------------------

  /**
   * Record a versioned contract acceptance: version, content hash, timestamp,
   * IP, signatory name + role (FR3.10). Sets `contract_accepted` true.
   */
  async acceptContract(
    supplierId: string,
    acceptance: ContractAcceptance,
  ): Promise<SupplierContractView> {
    await this.getOrThrow(supplierId);
    const updated = await this.repo.update(supplierId, {
      contract_accepted: true,
      contract_acceptance: acceptance,
      updated_ts: new Date().toISOString(),
    });
    if (!updated) throw new NotFoundError(`Supplier not found: ${supplierId}`);
    this.audit.append({
      type: 'supplier.contract.accepted',
      actor: 'supplier',
      actor_id: supplierId,
      role: roleOf(updated),
      subject: { supplier_id: supplierId },
      // Hash/version/signatory are the audit proof; keep them, they are not PII.
      payload: {
        version: acceptance.version,
        content_hash: acceptance.content_hash,
        signatory_role: acceptance.signatory_role,
        accepted_ts: acceptance.accepted_ts,
      },
    });
    return SupplierService.toContractView(updated);
  }

  // ---- FR3.5 vetting gate + FR3.3 cap policy: activation --------------------

  /**
   * Activate a supplier. Blocks unless every FR3.5 artifact, contract acceptance,
   * an OTP-verified contact and a valid declared TAT are present. Then applies the
   * cap policy (FR3.3): a Track-A primary beyond the destination cap is deflected
   * to the bench with a prompt (a 422 the caller surfaces), never silently added.
   */
  async activate(supplierId: string): Promise<{ supplier: SupplierContractView; cap: CapDecision }> {
    const supplier = await this.getOrThrow(supplierId);

    const blockers = activationBlockers(supplier, this.config);
    if (blockers.length) {
      throw new UnprocessableEntityError('Activation blocked', { blockers });
    }

    // Cap enforced against the FIRST served destination's primary count. A DMC
    // serving several destinations is capped per destination; onboarding admits
    // it against its lead destination (others handled by later manual edits).
    const destination = supplier.destinations[0];
    const cap = destination ? capForDestination(this.config, destination)?.primary : undefined;
    const primaryCount = destination
      ? await this.repo.countInSlot(destination, supplier.track, 'primary')
      : 0;
    const decision = decideCapSlot(supplier.track, primaryCount, cap);

    if (decision.outcome === 'bench') {
      // 6th primary rejected WITH a bench-assignment prompt (AC).
      this.audit.append({
        type: 'supplier.cap.rejected',
        actor: 'system',
        actor_id: this.actorId,
        role: roleOf(supplier),
        subject: { supplier_id: supplierId, destination },
        payload: { reason: decision.reason, primary_count: decision.primary_count, cap: decision.cap },
      });
      throw new UnprocessableEntityError('Primary cap reached', {
        reason: 'cap_full',
        prompt: 'assign_to_bench',
        destination,
        primary_count: decision.primary_count,
        cap: decision.cap,
        action: `POST /api/v1/suppliers/${supplierId}/bench`,
      });
    }

    // The bench branch returned above, so the slot here is 'primary' or 'reserve'
    // and the supplier goes active in that slot.
    const tier = decision.slot;
    const status = 'active' as const;
    const updated = await this.repo.update(supplierId, {
      tier,
      status,
      updated_ts: new Date().toISOString(),
    });
    if (!updated) throw new NotFoundError(`Supplier not found: ${supplierId}`);
    this.audit.append({
      type: 'supplier.activated',
      actor: 'ops',
      actor_id: this.actorId,
      role: roleOf(updated),
      subject: { supplier_id: supplierId, destination },
      before: { status: supplier.status, tier: supplier.tier ?? null },
      after: { status, tier },
      payload: { cap_outcome: decision.outcome },
    });
    return { supplier: SupplierService.toContractView(updated), cap: decision };
  }

  /** Assign a supplier to the reserve bench (FR3.3 — the 6th-primary prompt). */
  async assignToBench(supplierId: string): Promise<SupplierContractView> {
    const before = await this.getOrThrow(supplierId);
    const updated = await this.repo.update(supplierId, {
      tier: 'bench',
      status: 'bench',
      updated_ts: new Date().toISOString(),
    });
    if (!updated) throw new NotFoundError(`Supplier not found: ${supplierId}`);
    this.audit.append({
      type: 'supplier.benched',
      actor: 'ops',
      actor_id: this.actorId,
      role: roleOf(updated),
      subject: { supplier_id: supplierId, destination: before.destinations[0] },
      before: { status: before.status, tier: before.tier ?? null },
      after: { status: 'bench', tier: 'bench' },
    });
    return SupplierService.toContractView(updated);
  }

  // ---- Read APIs ------------------------------------------------------------

  /** `GET /api/v1/suppliers` — directory, tiering + fairness applied server-side. */
  async listDirectory(filter: { destination?: string; track?: string }): Promise<SupplierContractView[]> {
    const rows = await this.repo.findDirectory(filter);
    return rows.sort(compareCandidates).map((s) => SupplierService.toContractView(s));
  }

  /**
   * FR3.8 candidate query for M5/M12: destination + track + tier + status, ordered
   * deterministically by tier → scorecard rank → fairness-debt. Each row is
   * flagged when a material contract version bump requires re-acceptance before
   * RFQ delivery (FR3.10) — the caller (M5) must not broadcast to a flagged row.
   */
  async findCandidates(query: CandidateQuery): Promise<CandidateRow[]> {
    const rows = (await this.repo.findCandidates(query)).sort(compareCandidates);
    return rows.map((s) => ({
      ...SupplierService.toContractView(s),
      status: s.status,
      ...(s.quality_tier ? { quality_tier: s.quality_tier } : {}),
      scorecard_rank: s.scorecard?.rank ?? null,
      fairness_debt: s.scorecard?.fairness_debt ?? null,
      reacceptance_required: requiresReacceptance(s, query.current_contract_version),
    }));
  }

  /** Fetch one supplier (contract view). */
  async getOne(supplierId: string): Promise<SupplierContractView> {
    return SupplierService.toContractView(await this.getOrThrow(supplierId));
  }

  /**
   * How to address this supplier when sending them an RFQ (FR3.7).
   *
   * Deliberately narrow: it returns a name and an address and nothing else, so
   * M4 can put a mail in front of the right person without the contact block —
   * phones, roles, OTP state — leaving this module. `quoter` is the role that
   * exists to receive these; `owner` is the fallback at a one-person operation.
   * Returns null rather than throwing for an unknown supplier: a dispatcher
   * asking about a stale id should skip it, not fail the whole wave.
   */
  async quoteContact(supplierId: string): Promise<{ name?: string; email?: string } | null> {
    const found = await this.repo.findBySupplierId(supplierId);
    if (!found) return null;
    const contacts = found.contacts ?? [];
    const contact = contacts.find((c) => c.role === 'quoter' && c.email) ?? contacts.find((c) => c.email);
    if (!contact?.email) return null;
    return { name: contact.name, email: contact.email };
  }

  /** Expose the audit trail for a supplier (ops/debug). */
  auditTrail(supplierId: string) {
    return this.audit.bySubject({ supplier_id: supplierId });
  }

  /** Stable id generator for callers that do not supply one. */
  static newSupplierId(): string {
    return `sup_${randomUUID().slice(0, 8)}`;
  }
}
