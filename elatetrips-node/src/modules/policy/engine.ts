import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type {
  EstimationConfig, Outcome, OwnedPolicy, Policy, PolicyContext, PolicySelection,
  PolicySnapshot, PolicySnapshotEvent, RefundEstimate, ResolutionConfig, SnapshotProposal,
} from './types';
import {
  auditInput, calendarDate, catalog, context, estimationConfig, id, immutable,
  integer, InvalidPolicyInput, money, ordinal, parsePolicy, record, resolutionConfig, snapshot,
} from './validation';

function guarded<T>(work: () => Outcome<T>): Outcome<T> {
  try { return immutable(work()); } catch (error: unknown) {
    if (error instanceof InvalidPolicyInput) return immutable({ status: 'invalid', issues: [error.message] });
    throw error;
  }
}
/** Validates the canonical frozen shape plus safe numeric, calendar and scope semantics. */
export function validatePolicy(input: unknown): Outcome<Policy> {
  return guarded(() => ({ status: 'ok', value: parsePolicy(input) }));
}
function matchingPolicy(owner: OwnedPolicy, bound: PolicyContext, config: ResolutionConfig): boolean {
  const policy = owner.policy;
  return owner.tenant_id === bound.tenant_id
    && (policy.partner_id === undefined || policy.partner_id === bound.partner_id)
    && (policy.quote_id === undefined || policy.quote_id === bound.quote_id)
    && policy.effective_from <= bound.business_date
    && (policy.effective_to === undefined || (config.effective_to === 'inclusive' ? bound.business_date <= policy.effective_to : bound.business_date < policy.effective_to));
}
function select(owners: readonly OwnedPolicy[], bound: PolicyContext, config: ResolutionConfig): Outcome<PolicySelection> {
  for (const [index, scope] of config.scopes.entries()) {
    if (index > 0 && config.fallback === 'deny') return { status: 'unavailable', reason: 'scope_fallback_disabled' };
    const candidates = owners.filter((owner) => owner.policy.scope === scope && matchingPolicy(owner, bound, config));
    if (candidates.length > 1) return { status: 'ambiguous', reason: `overlapping_${scope}_policies` };
    const owner = candidates[0];
    if (owner !== undefined) return { status: 'ok', value: { owner, context: bound, resolution: config } };
  }
  return { status: 'unavailable', reason: 'no_effective_policy' };
}
/** Does not authenticate callers: owner/context bindings must come from a trusted adapter. */
export function resolvePolicy(input: unknown): Outcome<PolicySelection> {
  return guarded(() => {
    const request = record(input, 'request', ['catalog', 'context', 'resolution']);
    const owners = catalog(request.catalog);
    const bound = context(request.context);
    if (request.resolution === undefined || request.resolution === null) return { status: 'unavailable', reason: 'resolution_configuration_missing' };
    return select(owners, bound, resolutionConfig(request.resolution));
  });
}
/** JSON-only deterministic key ordering; all values have already passed strict parsers. */
function canonical(value: unknown): string {
  if (value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item: unknown) => canonical(item)).join(',')}]`;
  if (typeof value === 'object') {
    const fields = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${fields.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  throw new InvalidPolicyInput('fingerprint: expected JSON data');
}
/**
 * Pure proposal only. Future adapter must atomically commit snapshot + append-only outbox/audit,
 * enforce booking uniqueness and stable command/event ID + fingerprint retry checks, and authorize.
 * This function records neither a durable snapshot nor a paid/confirmed booking.
 */
export function preparePolicySnapshot(input: unknown): Outcome<SnapshotProposal> {
  return guarded(() => {
    const request = record(input, 'request', ['catalog', 'context', 'resolution', 'acceptance', 'estimation', 'audit']);
    const selected = resolvePolicy({ catalog: request.catalog, context: request.context, resolution: request.resolution });
    if (selected.status !== 'ok') return selected;
    const accepted = record(request.acceptance, 'acceptance', ['booking_id', 'rfq_id', 'trip_start_date', 'amount', 'policy_id', 'policy_version']);
    const acceptedPolicyId = id(accepted.policy_id, 'acceptance.policy_id');
    const acceptedPolicyVersion = integer(accepted.policy_version, 'acceptance.policy_version', 1);
    if (acceptedPolicyId !== selected.value.owner.policy.policy_id || acceptedPolicyVersion !== selected.value.owner.policy.version) throw new InvalidPolicyInput('acceptance: exact accepted policy reference differs from selected policy');
    const tripStart = calendarDate(accepted.trip_start_date, 'acceptance.trip_start_date');
    if (tripStart < selected.value.context.business_date) throw new InvalidPolicyInput('acceptance: trip precedes acceptance business date');
    const audit = auditInput(request.audit);
    const acceptedSnapshot: PolicySnapshot = {
      schema_version: 1,
      ...selected.value.context,
      booking_id: id(accepted.booking_id, 'acceptance.booking_id'), rfq_id: id(accepted.rfq_id, 'acceptance.rfq_id'),
      trip_start_date: tripStart, accepted_amount: money(accepted.amount, 'acceptance.amount'),
      policy: selected.value.owner.policy, resolution: selected.value.resolution,
      estimation: request.estimation === undefined || request.estimation === null ? null : estimationConfig(request.estimation),
    };
    // Event envelope/payload mirror contracts/events.md policy.snapshotted (BR-6/BR-18).
    const event: PolicySnapshotEvent = {
      event_id: audit.event_id, type: 'policy.snapshotted', actor: audit.actor, actor_id: audit.actor_id, role: audit.role, ts: audit.ts,
      subject: { rfq_id: acceptedSnapshot.rfq_id, quote_id: acceptedSnapshot.quote_id, booking_id: acceptedSnapshot.booking_id },
      before: null, after: { policy_snapshot: acceptedSnapshot },
      payload: { booking_id: acceptedSnapshot.booking_id, policy_id: acceptedSnapshot.policy.policy_id, version: acceptedSnapshot.policy.version },
    };
    const fingerprint = createHash('sha256').update(canonical({ command_id: audit.command_id, snapshot: acceptedSnapshot, event })).digest('hex');
    return { status: 'ok', value: { kind: 'policy_snapshot_proposal', command_id: audit.command_id, fingerprint, snapshot: acceptedSnapshot, event } };
  });
}
/** Validates/clones a trusted persisted snapshot without consulting current policy effectivity. */
export function validatePolicySnapshot(input: unknown): Outcome<PolicySnapshot> {
  return guarded(() => ({ status: 'ok', value: snapshot(input) }));
}
function roundedPercentage(amount: number, percent: number, rounding: EstimationConfig['rounding']): number {
  // Contract percent denominator is 100; bigint prevents unsafe amount * percent intermediates.
  const numerator = BigInt(amount) * BigInt(percent);
  const divisor = 100n;
  const quotient = numerator / divisor;
  const remainder = numerator % divisor;
  let roundUp = false;
  if (rounding === 'ceil') roundUp = remainder > 0n;
  if (rounding === 'half_up') roundUp = remainder * 2n >= divisor;
  if (rounding === 'half_even') roundUp = remainder * 2n > divisor || (remainder * 2n === divisor && quotient % 2n !== 0n);
  // Valid percent is <=100, so result is <= safe input amount even when rounded upward.
  return Number(quotient + (roundUp ? 1n : 0n));
}
/** Estimate only: no provider cancellation, inventory release, refund settlement or guarantee. */
export function estimateRefund(input: unknown): Outcome<RefundEstimate> {
  return guarded(() => {
    const request = record(input, 'request', ['snapshot', 'cancellation_date', 'trip_start_date', 'captured_amount']);
    const accepted = snapshot(request.snapshot);
    const cancellationDate = calendarDate(request.cancellation_date, 'cancellation_date');
    const tripStart = calendarDate(request.trip_start_date, 'trip_start_date');
    if (tripStart !== accepted.trip_start_date) throw new InvalidPolicyInput('trip_start_date: does not match accepted snapshot');
    if (cancellationDate < accepted.business_date) throw new InvalidPolicyInput('cancellation_date: precedes acceptance business date');
    const captured = money(request.captured_amount, 'captured_amount');
    if (captured.currency !== accepted.accepted_amount.currency) throw new InvalidPolicyInput('captured_amount: currency differs from accepted amount');
    if (captured.amount > accepted.accepted_amount.amount) throw new InvalidPolicyInput('captured_amount: exceeds accepted amount');
    const config = accepted.estimation;
    if (config === null) return { status: 'unavailable', reason: 'estimation_configuration_missing' };
    const daysBefore = ordinal(tripStart) - ordinal(cancellationDate);
    if (daysBefore < 0) return { status: 'unavailable', reason: 'cancellation_after_trip_start' };
    const peakDate = config.peak_basis === 'trip_start_date' ? tripStart : cancellationDate;
    const peaks = (accepted.policy.peak_overrides ?? []).filter((peak) => peak.from <= peakDate && (config.peak_end === 'inclusive' ? peakDate <= peak.to : peakDate < peak.to));
    if (peaks.length > 1) return { status: 'ambiguous', reason: 'overlapping_peak_overrides' };
    const peak = peaks[0];
    const selectedBands = peak === undefined ? accepted.policy.refund_bands : peak.refund_bands;
    const band = [...selectedBands].filter((item) => daysBefore >= item.days_before).sort((left, right) => right.days_before - left.days_before)[0];
    if (band === undefined) return { status: 'unavailable', reason: peak === undefined ? 'no_applicable_refund_band' : 'no_applicable_peak_refund_band' };
    const basis = config.percentage_basis === 'accepted' ? accepted.accepted_amount : captured;
    const computed = roundedPercentage(basis.amount, band.refund_pct, config.rounding);
    return {
      status: 'ok', value: {
        kind: 'refund_estimate', booking_id: accepted.booking_id, policy_id: accepted.policy.policy_id, policy_version: accepted.policy.version,
        configuration_version: config.version, cancellation_date: cancellationDate, trip_start_date: tripStart, days_before: daysBefore,
        source: peak === undefined ? 'base' : 'peak', band, percentage_basis: basis, captured_amount: captured,
        refund: { amount: Math.min(computed, captured.amount), currency: captured.currency }, capped: computed > captured.amount,
      },
    };
  });
}

/** Validate a complete saved proposal without catalog resolution, proposal creation or clock access. */
export function validatePolicyProposal(input: unknown): Outcome<SnapshotProposal> {
  return guarded(() => {
    const raw = record(input, 'proposal', ['kind', 'command_id', 'fingerprint', 'snapshot', 'event']);
    if (raw.kind !== 'policy_snapshot_proposal') throw new InvalidPolicyInput('proposal: unsupported kind');
    const accepted = snapshot(raw.snapshot);
    const eventRaw = record(raw.event, 'event', ['event_id', 'type', 'actor', 'actor_id', 'role', 'ts', 'subject', 'before', 'after', 'payload']);
    record(eventRaw.subject, 'event.subject', ['rfq_id', 'quote_id', 'booking_id']);
    const after = record(eventRaw.after, 'event.after', ['policy_snapshot']);
    snapshot(after.policy_snapshot);
    record(eventRaw.payload, 'event.payload', ['booking_id', 'policy_id', 'version']);
    const audit = auditInput({ command_id: raw.command_id, event_id: eventRaw.event_id, actor: eventRaw.actor, actor_id: eventRaw.actor_id, role: eventRaw.role, ts: eventRaw.ts });
    const expected: PolicySnapshotEvent = {
      event_id: audit.event_id, type: 'policy.snapshotted', actor: audit.actor, actor_id: audit.actor_id, role: audit.role, ts: audit.ts,
      subject: { rfq_id: accepted.rfq_id, quote_id: accepted.quote_id, booking_id: accepted.booking_id }, before: null,
      after: { policy_snapshot: accepted }, payload: { booking_id: accepted.booking_id, policy_id: accepted.policy.policy_id, version: accepted.policy.version },
    };
    if (!isDeepStrictEqual(raw.event, expected)) throw new InvalidPolicyInput('proposal: event differs from snapshot');
    const fingerprint = createHash('sha256').update(canonical({ command_id: audit.command_id, snapshot: accepted, event: expected })).digest('hex');
    if (raw.fingerprint !== fingerprint) throw new InvalidPolicyInput('proposal: invalid advisory fingerprint');
    return { status: 'ok', value: { kind: 'policy_snapshot_proposal', command_id: audit.command_id, fingerprint, snapshot: accepted, event: expected } };
  });
}
