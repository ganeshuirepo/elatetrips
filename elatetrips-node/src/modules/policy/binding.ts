import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { openPolicySnapshotStore, snapshotPolicySchema, type PolicySnapshotOptions, type PolicySnapshotCommand, type PolicySnapshotResult, type PolicySnapshot } from '../foundation/policy-snapshot';
import { estimateRefund, preparePolicySnapshot, validatePolicyProposal } from './engine';
import { immutable, resolutionConfig, estimationConfig, money, record, calendarDate, InvalidPolicyInput } from './validation';
import type { OwnedPolicy, SnapshotProposal, PolicySnapshot as ProducerSnapshot } from './types';

const identifier = z.string().min(1).max(128).refine((value) => value.trim() === value && !value.includes('\0'));
const intentSchema = z.object({
  commandId: identifier, correlationId: identifier, snapshotId: identifier, eventId: identifier,
  bookingId: identifier, contextId: identifier, tenantId: identifier, quoteId: identifier, partnerId: identifier,
  actorId: identifier, actor: z.enum(['customer', 'ops', 'supplier', 'system', 'ai']),
  role: z.enum(['customer', 'dmc', 'hotel', 'provider', 'ops', 'platform']),
  acceptanceId: identifier, acceptanceRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  rfqId: identifier, businessDate: z.string(), tripStartDate: z.string(),
  policyId: identifier, policyVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  amount: z.unknown(), resolution: z.unknown(), estimation: z.unknown(),
}).strict();
/** Complete caller semantics; these fields alone never establish authenticated consent. */
export interface PolicyBindingIntent extends z.infer<typeof intentSchema> {
  amount: ProducerSnapshot['accepted_amount'];
  resolution: ProducerSnapshot['resolution'];
  estimation: ProducerSnapshot['estimation'];
}
export interface PolicyAcceptanceEvidence { readonly issuer: string; readonly recordId: string; readonly revision: number; readonly proof: string }
export interface TrustedPolicyAcceptance {
  readonly intent: PolicyBindingIntent;
  readonly catalog: readonly OwnedPolicy[];
  readonly evidence: PolicyAcceptanceEvidence;
}
export interface PolicyBindingBody {
  readonly format: 'policy-binding-v1';
  readonly intent: PolicyBindingIntent;
  readonly proposal: SnapshotProposal;
  readonly evidence: PolicyAcceptanceEvidence;
}
export interface PolicyAcceptanceAuthority {
  /** Authenticated authoritative adapter, never an echo of caller JSON. */
  load(acceptanceId: string, revision: number): Promise<TrustedPolicyAcceptance | null>;
  /** Verify durable evidence over ENTIRE intent and exact snapshot, independent of latest catalog. */
  verify(evidence: Readonly<PolicyAcceptanceEvidence>, intent: Readonly<PolicyBindingIntent>, snapshot: Readonly<ProducerSnapshot>): boolean;
}
export interface PolicyBindingOptions {
  readonly foundation: Omit<PolicySnapshotOptions, 'validateProducer'>;
  readonly acceptance: PolicyAcceptanceAuthority;
  /** Proposal time only; never consulted on saved retry/read. */
  readonly proposalClock: () => string;
}
export class PolicyBindingError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'ACCEPTANCE_UNAVAILABLE' | 'PROVENANCE_INVALID' | 'IDEMPOTENCY_CONFLICT' | 'PRODUCER_INVALID', message: string) { super(message); }
}
function parseIntent(input: unknown): PolicyBindingIntent {
  try {
    const parsed = intentSchema.parse(record(input, 'intent', Object.keys(intentSchema.shape)));
    return immutable({ ...parsed, businessDate: calendarDate(parsed.businessDate, 'intent.businessDate'), tripStartDate: calendarDate(parsed.tripStartDate, 'intent.tripStartDate'), amount: money(parsed.amount, 'intent.amount'), resolution: resolutionConfig(parsed.resolution), estimation: parsed.estimation === null ? null : estimationConfig(parsed.estimation) });
  } catch { throw new PolicyBindingError('INVALID_REQUEST', 'Invalid policy binding intent'); }
}
const evidenceSchema = z.object({ issuer: identifier, recordId: identifier, revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), proof: z.string().min(1) }).strict();
function producer(intent: PolicyBindingIntent, catalog: readonly OwnedPolicy[], ts: string): SnapshotProposal {
  const result = preparePolicySnapshot({
    catalog, context: { tenant_id: intent.tenantId, quote_id: intent.quoteId, partner_id: intent.partnerId, business_date: intent.businessDate },
    resolution: intent.resolution, estimation: intent.estimation,
    acceptance: { booking_id: intent.bookingId, rfq_id: intent.rfqId, trip_start_date: intent.tripStartDate, amount: intent.amount, policy_id: intent.policyId, policy_version: intent.policyVersion },
    audit: { command_id: intent.commandId, event_id: intent.eventId, actor: intent.actor, actor_id: intent.actorId, role: intent.role, ts },
  });
  if (result.status !== 'ok') throw new PolicyBindingError('PRODUCER_INVALID', 'Accepted policy could not produce a valid snapshot');
  return result.value;
}
function extractBody(value: unknown, authority: PolicyAcceptanceAuthority): PolicyBindingBody {
  const raw = record(value, 'body', ['format', 'intent', 'proposal', 'evidence']);
  if (raw.format !== 'policy-binding-v1') throw new InvalidPolicyInput('body: unsupported binding format');
  const intent = parseIntent(raw.intent);
  const evidence = immutable(evidenceSchema.parse(record(raw.evidence, 'evidence', Object.keys(evidenceSchema.shape))));
  const validated = validatePolicyProposal(raw.proposal);
  if (validated.status !== 'ok') throw new PolicyBindingError('PRODUCER_INVALID', 'Invalid producer proposal');
  const expected = validated.value;
  const accepted = expected.snapshot;
  if (expected.command_id !== intent.commandId || expected.event.event_id !== intent.eventId || expected.event.actor_id !== intent.actorId || expected.event.actor !== intent.actor || expected.event.role !== intent.role
    || accepted.booking_id !== intent.bookingId || accepted.tenant_id !== intent.tenantId || accepted.quote_id !== intent.quoteId || accepted.partner_id !== intent.partnerId || accepted.rfq_id !== intent.rfqId
    || accepted.business_date !== intent.businessDate || accepted.trip_start_date !== intent.tripStartDate || accepted.policy.policy_id !== intent.policyId || accepted.policy.version !== intent.policyVersion
    || !isDeepStrictEqual(accepted.accepted_amount, intent.amount) || !isDeepStrictEqual(accepted.resolution, intent.resolution) || !isDeepStrictEqual(accepted.estimation, intent.estimation)) throw new PolicyBindingError('PRODUCER_INVALID', 'Producer body differs from caller semantics');
  if (evidence.recordId !== intent.acceptanceId || evidence.revision !== intent.acceptanceRevision || authority.verify(evidence, intent, expected.snapshot) !== true) throw new PolicyBindingError('PROVENANCE_INVALID', 'Trusted acceptance provenance required');
  return immutable({ format: 'policy-binding-v1', intent, proposal: expected, evidence });
}
function projection(body: PolicyBindingBody): PolicySnapshot {
  const { intent, proposal } = body;
  return { snapshotId: intent.snapshotId, bookingId: intent.bookingId, quoteId: intent.quoteId, partnerId: intent.partnerId, tenantId: intent.tenantId, contextId: intent.contextId, policy: snapshotPolicySchema.parse(proposal.snapshot.policy), body };
}
function command(body: PolicyBindingBody): PolicySnapshotCommand {
  return { commandId: body.intent.commandId, correlationId: body.intent.correlationId, snapshot: projection(body), event: { ...body.proposal.event, after: body } };
}
/** Complete producer body/projection validation plus mandatory authenticated provenance. */
export function createPolicyProducerValidator(authority: PolicyAcceptanceAuthority): PolicySnapshotOptions['validateProducer'] {
  if (typeof authority?.verify !== 'function') throw new PolicyBindingError('PROVENANCE_INVALID', 'Acceptance verifier is required');
  return (input) => { try { return isDeepStrictEqual(input, projection(extractBody(input.body, authority))); } catch { return false; } };
}
/** Foundation owns encryption, durable atomicity, receipts and internal outbox/audit. */
export async function openPolicyBindingService(options: PolicyBindingOptions) {
  if (typeof options.acceptance?.load !== 'function' || typeof options.acceptance?.verify !== 'function' || typeof options.proposalClock !== 'function') throw new PolicyBindingError('ACCEPTANCE_UNAVAILABLE', 'Trusted acceptance dependencies and proposal clock are required');
  const authority = options.acceptance;
  const store = await openPolicySnapshotStore({ ...options.foundation, validateProducer: createPolicyProducerValidator(authority) });
  function saved(result: PolicySnapshotResult, intent: PolicyBindingIntent): PolicySnapshotCommand {
    const body = extractBody(result.snapshot.body, authority);
    if (!isDeepStrictEqual(body.intent, intent)) throw new PolicyBindingError('IDEMPOTENCY_CONFLICT', 'Caller semantics differ from accepted request');
    return command(body);
  }
  return Object.freeze({
    async accept(token: string, input: unknown): Promise<PolicySnapshotResult> {
      // Strict parsing detaches caller-owned data synchronously before the first await.
      const intent = parseIntent(input);
      const previous = await store.read(token, intent.bookingId);
      if (previous !== null) return store.commit(token, saved(previous, intent));
      const loaded = await authority.load(intent.acceptanceId, intent.acceptanceRevision);
      if (loaded === null) throw new PolicyBindingError('ACCEPTANCE_UNAVAILABLE', 'Accepted record is unavailable');
      if (!isDeepStrictEqual(parseIntent(loaded.intent), intent)) throw new PolicyBindingError('PROVENANCE_INVALID', 'Accepted record differs from caller intent');
      const proposal = producer(intent, loaded.catalog, options.proposalClock());
      const body = extractBody({ format: 'policy-binding-v1', intent, proposal, evidence: loaded.evidence }, authority);
      try { return await store.commit(token, command(body)); }
      catch (error: unknown) {
        // Preserve strict foundation fingerprints; fresh authorization precedes race reconciliation.
        const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
        if (code !== 'IDEMPOTENCY_CONFLICT' && code !== 'RECORD_IMMUTABLE' && code !== 'REVISION_CONFLICT') throw error;
        const winner = await store.read(token, intent.bookingId);
        if (winner === null) throw error;
        return store.commit(token, saved(winner, intent));
      }
    },
    async read(token: string, bookingId: string): Promise<PolicySnapshotResult | null> { return store.read(token, identifier.parse(bookingId)); },
    async estimate(token: string, bookingId: string, input: unknown) {
      const request = record(input, 'estimate', ['cancellation_date', 'captured_amount']);
      const cancellationDate = z.string().parse(request.cancellation_date);
      const captured = money(request.captured_amount, 'estimate.captured_amount');
      const result = await store.read(token, identifier.parse(bookingId));
      if (result === null) return immutable({ status: 'unavailable', reason: 'accepted_snapshot_missing' });
      const body = extractBody(result.snapshot.body, authority);
      return estimateRefund({ snapshot: body.proposal.snapshot, trip_start_date: body.proposal.snapshot.trip_start_date, cancellation_date: cancellationDate, captured_amount: captured });
    },
  });
}
