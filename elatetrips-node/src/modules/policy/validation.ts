import type {
  Actor, AuditInput, Currency, EstimationConfig, Money, OwnedPolicy, PeakOverride,
  Policy, PolicyContext, PolicyScope, PolicySnapshot, RefundBand, ResolutionConfig, Role,
} from './types';

export class InvalidPolicyInput extends Error {}
function fail(path: string, message: string): never { throw new InvalidPolicyInput(`${path}: ${message}`); }
function isArray(value: unknown): value is unknown[] { return Array.isArray(value); }
function list(value: unknown, path: string): readonly unknown[] {
  if (!isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return fail(path, 'expected plain JSON array');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1) return fail(path, 'sparse arrays and extra fields are not JSON data');
  for (const key of keys) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) return fail(path, 'unknown array field');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return fail(path, 'expected JSON array data properties');
  }
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function record(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  if (!isRecord(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return fail(path, 'expected a plain JSON object');
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !fields.includes(key)) return fail(path, 'unknown field');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return fail(path, 'expected JSON data properties');
  }
  return value;
}
export function id(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || value.trim().length === 0) {
    return fail(path, 'expected a nonblank ID of at most 128 characters');
  }
  return value;
}
export function integer(value: unknown, path: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    return fail(path, `expected safe integer in [${minimum}, ${maximum}]`);
  }
  return value;
}
function leap(year: number): boolean { return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0); }
function monthDays(year: number, month: number): number {
  if (month === 2) return leap(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
export function calendarDate(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail(path, 'expected YYYY-MM-DD');
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays(year, month)) return fail(path, 'invalid calendar date');
  return value;
}
/** Gregorian ordinal, independent of timezone, daylight saving, and Date's years 0..99 behavior. */
export function ordinal(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const previousYear = year - 1;
  let days = 365 * previousYear + Math.floor(previousYear / 4) - Math.floor(previousYear / 100) + Math.floor(previousYear / 400);
  for (let current = 1; current < month; current += 1) days += monthDays(year, current);
  return days + Number(date.slice(8, 10));
}
function timestamp(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return fail(path, 'expected explicit-offset timestamp');
  calendarDate(value.slice(0, 10), path);
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return fail(path, 'invalid clock time');
  if (!value.endsWith('Z') && (Number(value.slice(-5, -3)) > 23 || Number(value.slice(-2)) > 59)) return fail(path, 'invalid UTC offset');
  if (!Number.isFinite(Date.parse(value))) return fail(path, 'invalid timestamp');
  return value;
}
function scope(value: unknown, path: string): PolicyScope {
  if (value === 'quote' || value === 'partner' || value === 'platform_default') return value;
  return fail(path, 'unsupported policy scope');
}
function currency(value: unknown, path: string): Currency {
  if (value === 'INR' || value === 'USD' || value === 'EUR' || value === 'GBP' || value === 'AED') return value;
  return fail(path, 'unsupported contract currency');
}
export function money(value: unknown, path: string): Money {
  const input = record(value, path, ['amount', 'currency']);
  return { amount: integer(input.amount, `${path}.amount`), currency: currency(input.currency, `${path}.currency`) };
}
function bands(value: unknown, path: string): RefundBand[] {
  const result: RefundBand[] = [];
  for (const [index, raw] of list(value, path).entries()) {
    const itemPath = `${path}[${index}]`;
    const item = record(raw, itemPath, ['days_before', 'refund_pct']);
    const band = { days_before: integer(item.days_before, `${itemPath}.days_before`), refund_pct: integer(item.refund_pct, `${itemPath}.refund_pct`, 0, 100) };
    if (result.some((existing) => existing.days_before === band.days_before)) return fail(path, 'duplicate days_before threshold is ambiguous');
    result.push(band);
  }
  // Threshold order does not alter semantics; preserve supplied canonical data in snapshots.
  return result;
}
export function parsePolicy(value: unknown, path = 'policy'): Policy {
  const input = record(value, path, ['policy_id', 'version', 'scope', 'partner_id', 'quote_id', 'effective_from', 'effective_to', 'booking_terms', 'refund_bands', 'peak_overrides', 'flexibility_score']);
  const effectiveFrom = calendarDate(input.effective_from, `${path}.effective_from`);
  const effectiveTo = 'effective_to' in input ? calendarDate(input.effective_to, `${path}.effective_to`) : undefined;
  if (effectiveTo !== undefined && effectiveTo < effectiveFrom) return fail(path, 'inverted effective range');
  const policyScope = scope(input.scope, `${path}.scope`);
  const partnerId = 'partner_id' in input ? id(input.partner_id, `${path}.partner_id`) : undefined;
  const quoteId = 'quote_id' in input ? id(input.quote_id, `${path}.quote_id`) : undefined;
  // Scope semantics tighten the permissive schema to prevent accidental cross-resource application.
  if (policyScope === 'platform_default' && (partnerId !== undefined || quoteId !== undefined)) return fail(path, 'platform policy cannot bind partner or quote');
  if (policyScope === 'partner' && (partnerId === undefined || quoteId !== undefined)) return fail(path, 'partner policy requires only partner binding');
  if (policyScope === 'quote' && (partnerId === undefined || quoteId === undefined)) return fail(path, 'quote policy requires partner and quote binding');
  let bookingTerms: Policy['booking_terms'];
  if ('booking_terms' in input) {
    const terms = record(input.booking_terms, `${path}.booking_terms`, ['deposit_pct', 'balance_due_days_before']);
    bookingTerms = {
      ...('deposit_pct' in terms ? { deposit_pct: integer(terms.deposit_pct, `${path}.booking_terms.deposit_pct`, 0, 100) } : {}),
      ...('balance_due_days_before' in terms ? { balance_due_days_before: integer(terms.balance_due_days_before, `${path}.booking_terms.balance_due_days_before`) } : {}),
    };
  }
  let peaks: PeakOverride[] | undefined;
  if ('peak_overrides' in input) {
    peaks = list(input.peak_overrides, `${path}.peak_overrides`).map((raw: unknown, index: number) => {
      const peakPath = `${path}.peak_overrides[${index}]`;
      const peak = record(raw, peakPath, ['from', 'to', 'refund_bands']);
      const from = calendarDate(peak.from, `${peakPath}.from`);
      const to = calendarDate(peak.to, `${peakPath}.to`);
      if (to < from) return fail(peakPath, 'inverted peak range');
      return { from, to, refund_bands: bands(peak.refund_bands, `${peakPath}.refund_bands`) };
    });
    // Strict interior overlap is ambiguous under either end-date configuration.
    for (const [index, peak] of peaks.entries()) {
      if (peaks.slice(index + 1).some((other) => peak.from < other.to && other.from < peak.to)) return fail(path, 'overlapping peak ranges');
    }
  }
  return {
    policy_id: id(input.policy_id, `${path}.policy_id`), version: integer(input.version, `${path}.version`, 1), scope: policyScope,
    effective_from: effectiveFrom, refund_bands: bands(input.refund_bands, `${path}.refund_bands`),
    ...(effectiveTo !== undefined ? { effective_to: effectiveTo } : {}),
    ...(partnerId !== undefined ? { partner_id: partnerId } : {}), ...(quoteId !== undefined ? { quote_id: quoteId } : {}),
    ...(bookingTerms !== undefined ? { booking_terms: bookingTerms } : {}), ...(peaks !== undefined ? { peak_overrides: peaks } : {}),
    ...('flexibility_score' in input ? { flexibility_score: integer(input.flexibility_score, `${path}.flexibility_score`, 0, 100) } : {}),
  };
}
export function catalog(value: unknown): OwnedPolicy[] {
  return list(value, 'catalog').map((raw: unknown, index: number) => {
    const input = record(raw, `catalog[${index}]`, ['tenant_id', 'policy']);
    return { tenant_id: id(input.tenant_id, `catalog[${index}].tenant_id`), policy: parsePolicy(input.policy, `catalog[${index}].policy`) };
  });
}
export function context(value: unknown): PolicyContext {
  const input = record(value, 'context', ['tenant_id', 'partner_id', 'quote_id', 'business_date']);
  return { tenant_id: id(input.tenant_id, 'context.tenant_id'), partner_id: id(input.partner_id, 'context.partner_id'), quote_id: id(input.quote_id, 'context.quote_id'), business_date: calendarDate(input.business_date, 'context.business_date') };
}
export function resolutionConfig(value: unknown): ResolutionConfig {
  const input = record(value, 'resolution', ['version', 'scopes', 'fallback', 'effective_to']);
  const scopes = list(input.scopes, 'resolution.scopes').map((raw: unknown) => scope(raw, 'resolution.scopes'));
  const order: Record<PolicyScope, number> = { quote: 0, partner: 1, platform_default: 2 };
  if (scopes.length === 0 || scopes.some((item, index) => scopes.slice(0, index).some((previous) => order[previous] >= order[item]))) return fail('resolution.scopes', 'expected unique most-specific-first scopes');
  if (input.fallback !== 'allow' && input.fallback !== 'deny') return fail('resolution.fallback', 'explicit fallback required');
  if (input.effective_to !== 'inclusive' && input.effective_to !== 'exclusive') return fail('resolution.effective_to', 'explicit end boundary required');
  return { version: id(input.version, 'resolution.version'), scopes, fallback: input.fallback, effective_to: input.effective_to };
}
export function estimationConfig(value: unknown): EstimationConfig {
  const input = record(value, 'estimation', ['version', 'rounding', 'percentage_basis', 'peak_basis', 'peak_end']);
  if (input.rounding !== 'floor' && input.rounding !== 'ceil' && input.rounding !== 'half_up' && input.rounding !== 'half_even') return fail('estimation.rounding', 'explicit supported rounding required');
  if (input.percentage_basis !== 'accepted' && input.percentage_basis !== 'captured') return fail('estimation.percentage_basis', 'explicit percentage basis required');
  if (input.peak_basis !== 'trip_start_date' && input.peak_basis !== 'cancellation_date') return fail('estimation.peak_basis', 'explicit peak basis required');
  if (input.peak_end !== 'inclusive' && input.peak_end !== 'exclusive') return fail('estimation.peak_end', 'explicit peak boundary required');
  return { version: id(input.version, 'estimation.version'), rounding: input.rounding, percentage_basis: input.percentage_basis, peak_basis: input.peak_basis, peak_end: input.peak_end };
}
export function auditInput(value: unknown): AuditInput {
  const input = record(value, 'audit', ['command_id', 'event_id', 'actor', 'actor_id', 'role', 'ts']);
  const actor: Actor = input.actor === 'customer' || input.actor === 'ops' || input.actor === 'supplier' || input.actor === 'system' || input.actor === 'ai' ? input.actor : fail('audit.actor', 'unsupported actor');
  const role: Role = input.role === 'customer' || input.role === 'dmc' || input.role === 'hotel' || input.role === 'provider' || input.role === 'ops' || input.role === 'platform' ? input.role : fail('audit.role', 'unsupported role');
  return { command_id: id(input.command_id, 'audit.command_id'), event_id: id(input.event_id, 'audit.event_id'), actor, actor_id: id(input.actor_id, 'audit.actor_id'), role, ts: timestamp(input.ts, 'audit.ts') };
}
export function snapshot(value: unknown): PolicySnapshot {
  const input = record(value, 'snapshot', ['schema_version', 'tenant_id', 'booking_id', 'rfq_id', 'quote_id', 'partner_id', 'business_date', 'trip_start_date', 'accepted_amount', 'policy', 'resolution', 'estimation']);
  if (input.schema_version !== 1) return fail('snapshot.schema_version', 'unsupported snapshot version');
  const policy = parsePolicy(input.policy);
  const bound = context({ tenant_id: input.tenant_id, partner_id: input.partner_id, quote_id: input.quote_id, business_date: input.business_date });
  return snapshotFromFields(input, policy, bound);
}
function snapshotFromFields(input: Record<string, unknown>, policy: Policy, bound: PolicyContext): PolicySnapshot {
  const resolution = resolutionConfig(input.resolution);
  if (!resolution.scopes.includes(policy.scope)) return fail('snapshot', 'policy scope disabled in accepted resolution');
  if (bound.business_date < policy.effective_from || (policy.effective_to !== undefined && (resolution.effective_to === 'inclusive' ? bound.business_date > policy.effective_to : bound.business_date >= policy.effective_to))) return fail('snapshot', 'policy was not effective on acceptance business date');
  if ((policy.partner_id !== undefined && policy.partner_id !== bound.partner_id) || (policy.quote_id !== undefined && policy.quote_id !== bound.quote_id)) return fail('snapshot', 'policy resource binding mismatch');
  const tripStart = calendarDate(input.trip_start_date, 'snapshot.trip_start_date');
  if (tripStart < bound.business_date) return fail('snapshot', 'trip precedes acceptance business date');
  return { schema_version: 1, ...bound, booking_id: id(input.booking_id, 'snapshot.booking_id'), rfq_id: id(input.rfq_id, 'snapshot.rfq_id'), trip_start_date: tripStart, accepted_amount: money(input.accepted_amount, 'snapshot.accepted_amount'), policy, resolution, estimation: input.estimation === null ? null : estimationConfig(input.estimation) };
}
export function immutable<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
