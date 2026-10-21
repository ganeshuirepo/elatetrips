import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  estimateRefund, preparePolicySnapshot, resolvePolicy, validatePolicy, validatePolicySnapshot,
} from './index';
import type { EstimationConfig, Outcome, Policy, PolicySnapshot, ResolutionConfig } from './index';

// Nonproduction examples only. Engine ships no catalog, rates or commercial defaults.
function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    policy_id: 'fixture-policy', version: 1, scope: 'quote', partner_id: 'fixture-partner', quote_id: 'fixture-quote',
    effective_from: '2028-01-01', effective_to: '2028-03-01',
    booking_terms: { deposit_pct: 25, balance_due_days_before: 2 }, flexibility_score: 47,
    refund_bands: [{ days_before: 7, refund_pct: 75 }, { days_before: 0, refund_pct: 25 }], ...overrides,
  };
}
function resolution(overrides: Partial<ResolutionConfig> = {}): ResolutionConfig {
  return { version: 'fixture-resolution-v1', scopes: ['quote', 'partner', 'platform_default'], fallback: 'allow', effective_to: 'inclusive', ...overrides };
}
function estimation(overrides: Partial<EstimationConfig> = {}): EstimationConfig {
  return { version: 'fixture-estimation-v1', rounding: 'floor', percentage_basis: 'accepted', peak_basis: 'trip_start_date', peak_end: 'inclusive', ...overrides };
}
function request(selected: Policy = policy()) {
  return {
    catalog: [{ tenant_id: 'fixture-tenant', policy: selected }],
    context: { tenant_id: 'fixture-tenant', partner_id: 'fixture-partner', quote_id: 'fixture-quote', business_date: '2028-02-01' },
    resolution: resolution(),
    acceptance: { booking_id: 'fixture-booking', rfq_id: 'fixture-rfq', trip_start_date: '2028-03-10', amount: { amount: 101, currency: 'INR' }, policy_id: selected.policy_id, policy_version: selected.version },
    estimation: estimation(),
    audit: { command_id: 'fixture-command', event_id: 'fixture-event', actor: 'customer', actor_id: 'fixture-customer', role: 'customer', ts: '2028-02-01T10:00:00+05:30' },
  };
}
function selection(selected: Policy = policy()) {
  const source = request(selected);
  return { catalog: source.catalog, context: source.context, resolution: source.resolution };
}
function ok<T>(outcome: Outcome<T>): T {
  assert.equal(outcome.status, 'ok', JSON.stringify(outcome));
  if (outcome.status !== 'ok') throw new Error('Expected successful test outcome');
  return outcome.value;
}
function invalid(outcome: Outcome<unknown>, pattern?: RegExp): void {
  assert.equal(outcome.status, 'invalid', JSON.stringify(outcome));
  if (outcome.status === 'invalid' && pattern) assert.match(outcome.issues.join(';'), pattern);
}
function accepted(selected: Policy = policy(), config: EstimationConfig | null = estimation()): PolicySnapshot {
  return ok(preparePolicySnapshot({ ...request(selected), estimation: config })).snapshot;
}
function estimate(snapshot: PolicySnapshot = accepted(), cancellationDate = '2028-03-03', capturedAmount = 101) {
  return estimateRefund({ snapshot, cancellation_date: cancellationDate, trip_start_date: snapshot.trip_start_date, captured_amount: { amount: capturedAmount, currency: snapshot.accepted_amount.currency } });
}

test('canonical policy is cloned, deep frozen and retains supplied bands and terms', () => {
  const raw = policy();
  const parsed = ok(validatePolicy(raw));
  assert.deepEqual(parsed, raw);
  assert.notEqual(parsed, raw);
  assert.ok(Object.isFrozen(parsed.refund_bands));
  assert.ok(Object.isFrozen(parsed.refund_bands[0]));
  assert.ok(Object.isFrozen(parsed.booking_terms));
  assert.equal(Object.isFrozen(raw), false);
  assert.equal('tenant_id' in parsed, false);
});

const malformedPolicies: readonly [string, unknown][] = [
  ['unknown root', { ...policy(), tenant_id: 'other' }],
  ['unknown terms', { ...policy(), booking_terms: { tax: 1 } }],
  ['unknown band', { ...policy(), refund_bands: [{ days_before: 1, refund_pct: 5, extra: true }] }],
  ['unknown peak', { ...policy(), peak_overrides: [{ from: '2028-03-01', to: '2028-03-10', refund_bands: [], extra: true }] }],
  ['missing ID', { ...policy(), policy_id: undefined }],
  ['blank ID', { ...policy(), policy_id: ' ' }],
  ['long ID', { ...policy(), policy_id: 'a'.repeat(129) }],
  ['unsafe version', { ...policy(), version: Number.MAX_SAFE_INTEGER + 1 }],
  ['zero version', { ...policy(), version: 0 }],
  ['fractional threshold', { ...policy(), refund_bands: [{ days_before: 0.5, refund_pct: 50 }] }],
  ['unsafe threshold', { ...policy(), refund_bands: [{ days_before: Infinity, refund_pct: 50 }] }],
  ['negative percent', { ...policy(), refund_bands: [{ days_before: 0, refund_pct: -1 }] }],
  ['excess percent', { ...policy(), refund_bands: [{ days_before: 0, refund_pct: 101 }] }],
  ['fractional percent', { ...policy(), refund_bands: [{ days_before: 0, refund_pct: 50.5 }] }],
  ['missing percent', { ...policy(), refund_bands: [{ days_before: 0 }] }],
  ['duplicate threshold', { ...policy(), refund_bands: [{ days_before: 0, refund_pct: 5 }, { days_before: 0, refund_pct: 10 }] }],
  ['excess deposit', { ...policy(), booking_terms: { deposit_pct: 101 } }],
  ['unsafe balance date', { ...policy(), booking_terms: { balance_due_days_before: Number.MAX_SAFE_INTEGER + 1 } }],
  ['unknown scope', { ...policy(), scope: 'tenant' }],
  ['partner scope without owner', { ...policy(), scope: 'partner', partner_id: undefined }],
  ['quote scope without partner', { ...policy(), partner_id: undefined }],
  ['platform with resource bindings', { ...policy(), scope: 'platform_default' }],
  ['out-of-range score', { ...policy(), flexibility_score: 101 }],
  ['missing bands', { ...policy(), refund_bands: undefined }],
  ['array root', []], ['null root', null], ['class instance', new Date()],
];
for (const [name, input] of malformedPolicies) test(`rejects malformed policy: ${name}`, () => invalid(validatePolicy(input)));

for (const date of ['0000-01-01', '1900-02-29', '2027-02-29', '2028-04-31', '2028-13-01', '2028-00-01', '2028-01-00', '2028-02-30', '2028-2-01', '10000-01-01', '2028-01-01T00:00:00Z']) {
  test(`rejects noncalendar or noncanonical date ${date}`, () => invalid(validatePolicy({ ...policy(), effective_from: date })));
}
for (const date of ['0001-01-01', '2000-02-29', '2028-02-29', '9999-12-31']) {
  test(`accepts Gregorian boundary date ${date}`, () => assert.equal(validatePolicy({ ...policy(), effective_from: date, effective_to: date }).status, 'ok'));
}
test('rejects inverted effective and peak ranges and overlapping peak interiors', () => {
  invalid(validatePolicy({ ...policy(), effective_to: '2027-01-01' }));
  invalid(validatePolicy({ ...policy(), peak_overrides: [{ from: '2028-03-10', to: '2028-03-01', refund_bands: [] }] }));
  invalid(validatePolicy({ ...policy(), peak_overrides: [
    { from: '2028-03-01', to: '2028-03-11', refund_bands: [] },
    { from: '2028-03-10', to: '2028-03-12', refund_bands: [] },
  ] }), /overlapping/);
});
test('rejects accessor and symbol properties without executing their contents', () => {
  const value = { ...policy() };
  Object.defineProperty(value, 'effective_to', { enumerable: true, get() { throw new Error('Accessor must not run'); } });
  invalid(validatePolicy(value));
  invalid(validatePolicy({ ...policy(), [Symbol('extra')]: true }));
});
test('rejects sparse, decorated and accessor arrays without running array accessors', () => {
  const sparse = new Array<unknown>(2);
  invalid(validatePolicy({ ...policy(), refund_bands: sparse }));
  const decorated = [{ days_before: 0, refund_pct: 10 }];
  Object.assign(decorated, { extra: true });
  invalid(validatePolicy({ ...policy(), refund_bands: decorated }));
  const getter: unknown[] = [];
  Object.defineProperty(getter, '0', { enumerable: true, get() { throw new Error('Array accessor must not run'); } });
  invalid(validatePolicy({ ...policy(), refund_bands: getter }));
  invalid(resolvePolicy({ ...selection(), catalog: sparse }));
});
test('resolves quote over partner over platform using exact scope bindings, independent of order', () => {
  const quote = policy();
  const partner: Policy = { policy_id: 'fixture-partner-policy', version: 4, scope: 'partner', partner_id: 'fixture-partner', effective_from: '2028-01-01', refund_bands: [] };
  const platform: Policy = { policy_id: 'fixture-platform', version: 2, scope: 'platform_default', effective_from: '2028-01-01', refund_bands: [] };
  const base = selection();
  const catalog = [platform, partner, quote].map((item) => ({ tenant_id: 'fixture-tenant', policy: item }));
  assert.equal(ok(resolvePolicy({ ...base, catalog })).owner.policy.policy_id, quote.policy_id);
  assert.equal(ok(resolvePolicy({ ...base, catalog: catalog.slice(0, 2) })).owner.policy.policy_id, partner.policy_id);
  assert.equal(ok(resolvePolicy({ ...base, catalog: catalog.slice(0, 1) })).owner.policy.policy_id, platform.policy_id);
  assert.equal(ok(resolvePolicy({ ...base, catalog: catalog.reverse() })).owner.policy.policy_id, quote.policy_id);
});
test('scope fallback and configured scope inclusion change results without engine edits', () => {
  const platform: Policy = { policy_id: 'fixture-platform', version: 1, scope: 'platform_default', effective_from: '2028-01-01', refund_bands: [] };
  const base = selection(platform);
  assert.deepEqual(resolvePolicy({ ...base, resolution: resolution({ fallback: 'deny' }) }), { status: 'unavailable', reason: 'scope_fallback_disabled' });
  assert.equal(resolvePolicy({ ...base, resolution: resolution({ scopes: ['platform_default'], fallback: 'deny' }) }).status, 'ok');
  assert.equal(resolvePolicy({ ...selection(), resolution: resolution({ scopes: ['partner', 'platform_default'] }) }).status, 'unavailable');
});
test('missing resolution configuration and empty catalog return explicit unavailable', () => {
  assert.deepEqual(resolvePolicy({ ...selection(), resolution: null }), { status: 'unavailable', reason: 'resolution_configuration_missing' });
  const { resolution: omitted, ...withoutConfig } = selection();
  assert.ok(omitted);
  assert.equal(resolvePolicy(withoutConfig).status, 'unavailable');
  assert.deepEqual(resolvePolicy({ ...selection(), catalog: [] }), { status: 'unavailable', reason: 'no_effective_policy' });
});
test('invalid or commercially ambiguous resolution configuration is rejected', () => {
  for (const resolutionValue of [{}, resolution({ scopes: [] }), resolution({ scopes: ['partner', 'quote'] }), resolution({ scopes: ['quote', 'quote'] }), { ...resolution(), fallback: 'automatic' }, { ...resolution(), effective_to: undefined }, { ...resolution(), percentage_denominator: 100 }]) {
    invalid(resolvePolicy({ ...selection(), resolution: resolutionValue }));
  }
});
test('two effective versions or duplicate entries are ambiguous, never latest-version/data-order wins', () => {
  const base = selection();
  const catalog = [...base.catalog, { tenant_id: 'fixture-tenant', policy: policy({ version: 2 }) }];
  assert.deepEqual(resolvePolicy({ ...base, catalog }), { status: 'ambiguous', reason: 'overlapping_quote_policies' });
  assert.equal(resolvePolicy({ ...base, catalog: catalog.reverse() }).status, 'ambiguous');
  assert.equal(resolvePolicy({ ...base, catalog: [...base.catalog, ...base.catalog] }).status, 'ambiguous');
});
test('does not cross tenant, partner or quote boundaries even with identical policy IDs', () => {
  const base = selection();
  for (const changed of [{ ...base.context, tenant_id: 'other-tenant' }, { ...base.context, partner_id: 'other-partner' }, { ...base.context, quote_id: 'other-quote' }]) {
    assert.equal(resolvePolicy({ ...base, context: changed }).status, 'unavailable');
  }
  const foreign = { tenant_id: 'other-tenant', policy: policy({ version: 99 }) };
  assert.equal(ok(resolvePolicy({ ...base, catalog: [foreign, ...base.catalog] })).owner.policy.version, 1);
  invalid(resolvePolicy({ ...base, catalog: [{ ...base.catalog[0], extra: true }] }));
  invalid(resolvePolicy({ ...base, context: { ...base.context, supplier_id: 'untrusted' } }));
});
test('effective dates include start and use explicit configured end boundary', () => {
  const base = selection();
  for (const date of ['2028-01-01', '2028-02-29', '2028-03-01']) assert.equal(resolvePolicy({ ...base, context: { ...base.context, business_date: date } }).status, 'ok');
  for (const date of ['2027-12-31', '2028-03-02']) assert.equal(resolvePolicy({ ...base, context: { ...base.context, business_date: date } }).status, 'unavailable');
  assert.equal(resolvePolicy({ ...base, context: { ...base.context, business_date: '2028-03-01' }, resolution: resolution({ effective_to: 'exclusive' }) }).status, 'unavailable');
});
test('snapshot returns exact policy plus immutable contract audit envelope and explicit proposal kind', () => {
  const proposal = ok(preparePolicySnapshot(request()));
  assert.equal(proposal.kind, 'policy_snapshot_proposal');
  assert.equal(proposal.command_id, 'fixture-command');
  assert.match(proposal.fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(proposal.event, {
    event_id: 'fixture-event', type: 'policy.snapshotted', actor: 'customer', actor_id: 'fixture-customer', role: 'customer', ts: '2028-02-01T10:00:00+05:30',
    subject: { booking_id: 'fixture-booking', quote_id: 'fixture-quote', rfq_id: 'fixture-rfq' }, before: null,
    after: { policy_snapshot: proposal.snapshot }, payload: { booking_id: 'fixture-booking', policy_id: 'fixture-policy', version: 1 },
  });
  assert.deepEqual(proposal.snapshot.policy, policy());
  assert.ok(Object.isFrozen(proposal));
  assert.ok(Object.isFrozen(proposal.event.payload));
  assert.ok(Object.isFrozen(proposal.snapshot.estimation));
  assert.equal('status' in proposal.snapshot, false);
  assert.equal('tenant_id' in proposal.snapshot.policy, false);
});
test('same retry inputs produce identical fingerprint; changed acceptance, actor, owner, config or IDs differ', () => {
  const raw = request();
  const first = ok(preparePolicySnapshot(raw));
  assert.equal(first.fingerprint, ok(preparePolicySnapshot(JSON.parse(JSON.stringify(raw)))).fingerprint);
  const variants = [
    { ...raw, acceptance: { ...raw.acceptance, amount: { amount: 102, currency: 'INR' } } },
    { ...raw, audit: { ...raw.audit, actor_id: 'other-customer' } },
    { ...raw, audit: { ...raw.audit, command_id: 'other-command' } },
    { ...raw, audit: { ...raw.audit, event_id: 'other-event' } },
    { ...raw, audit: { ...raw.audit, ts: '2028-02-01T10:00:01+05:30' } },
    { ...raw, estimation: estimation({ rounding: 'ceil' }) },
    { ...raw, resolution: resolution({ version: 'fixture-resolution-v2' }) },
    { ...raw, catalog: [{ tenant_id: 'other-tenant', policy: policy() }], context: { ...raw.context, tenant_id: 'other-tenant' } },
  ];
  for (const variant of variants) assert.notEqual(ok(preparePolicySnapshot(variant)).fingerprint, first.fingerprint);
});
test('caller/catalog/config mutation cannot change accepted snapshot or subsequent estimate', () => {
  const raw = request();
  const original = JSON.stringify(raw);
  const proposal = ok(preparePolicySnapshot(raw));
  assert.equal(JSON.stringify(raw), original);
  assert.equal(Object.isFrozen(raw.estimation), false);
  Object.assign(raw.catalog[0]?.policy ?? {}, { refund_bands: [{ days_before: 0, refund_pct: 0 }] });
  raw.estimation = estimation({ rounding: 'ceil' });
  raw.context.tenant_id = 'other-tenant';
  raw.acceptance.amount.amount = 999;
  assert.equal(ok(estimate(proposal.snapshot)).refund.amount, 75);
  assert.throws(() => Object.assign(proposal.snapshot.policy, { refund_bands: [] }), TypeError);
  assert.throws(() => Object.assign(proposal.snapshot.estimation ?? {}, { rounding: 'ceil' }), TypeError);
});
test('snapshot round-trips as JSON and remains authoritative after policy expires or catalog changes', () => {
  const original = accepted();
  const loaded = ok(validatePolicySnapshot(JSON.parse(JSON.stringify(original))));
  assert.deepEqual(loaded, original);
  assert.equal(resolvePolicy({ ...selection(), context: { ...selection().context, business_date: '2028-03-03' } }).status, 'unavailable');
  assert.equal(ok(estimate(loaded, '2028-03-03')).refund.amount, 75);
  invalid(validatePolicySnapshot({ ...loaded, business_date: '2027-12-31' }), /not effective/);
  invalid(validatePolicySnapshot({ ...loaded, schema_version: 2 }));
  invalid(validatePolicySnapshot({ ...loaded, partner_id: 'other-partner' }), /binding/);
  invalid(validatePolicySnapshot({ ...loaded, policy: { ...loaded.policy, extra: true } }));
});
test('snapshot preparation rejects unsupported policy, invalid audit and impossible acceptance', () => {
  invalid(preparePolicySnapshot({ ...request(), acceptance: { ...request().acceptance, trip_start_date: '2028-01-31' } }));
  assert.equal(preparePolicySnapshot({ ...request(), context: { ...request().context, business_date: '2028-03-02' } }).status, 'unavailable');
  for (const audit of [
    { ...request().audit, actor: 'admin' }, { ...request().audit, role: 'system' }, { ...request().audit, actor_id: '' },
    { ...request().audit, ts: '2028-02-30T10:00:00Z' }, { ...request().audit, ts: '2028-02-01T25:00:00Z' },
    { ...request().audit, ts: '2028-02-01T10:60:00Z' }, { ...request().audit, ts: '2028-02-01T10:00:60Z' },
    { ...request().audit, ts: '2028-02-01T10:00:00+24:00' }, { ...request().audit, ts: '2028-02-01T10:00:00' },
    { ...request().audit, ts: '2028-02-01T10:00:00+05:60' }, { ...request().audit, event_id: undefined },
    { ...request().audit, unsafe: true },
  ]) invalid(preparePolicySnapshot({ ...request(), audit }));
});
test('snapshot cannot silently substitute a different exact policy ID or version than accepted', () => {
  const raw = request();
  invalid(preparePolicySnapshot({ ...raw, acceptance: { ...raw.acceptance, policy_id: 'other-policy' } }), /exact accepted policy/);
  invalid(preparePolicySnapshot({ ...raw, acceptance: { ...raw.acceptance, policy_version: 2 } }), /exact accepted policy/);
  invalid(preparePolicySnapshot({ ...raw, catalog: [{ tenant_id: 'fixture-tenant', policy: policy({ version: 2 }) }] }), /exact accepted policy/);
  invalid(preparePolicySnapshot({ ...raw, acceptance: { ...raw.acceptance, policy_version: undefined } }));
});

for (const [date, days, percent, amount] of [
  ['2028-03-02', 8, 75, 75], ['2028-03-03', 7, 75, 75], ['2028-03-04', 6, 25, 25],
  ['2028-03-09', 1, 25, 25], ['2028-03-10', 0, 25, 25],
] satisfies readonly [string, number, number, number][]) {
  test(`refund selects exact threshold on ${date}`, () => {
    const output = ok(estimate(accepted(), date));
    assert.equal(output.days_before, days);
    assert.equal(output.band.refund_pct, percent);
    assert.deepEqual(output.refund, { amount, currency: 'INR' });
    assert.equal(output.kind, 'refund_estimate');
  });
}
test('calendar distance accounts for leap day and does not depend on elapsed hours or timezone', () => {
  const raw = request();
  raw.acceptance.trip_start_date = '2028-03-01';
  const value = ok(preparePolicySnapshot(raw)).snapshot;
  assert.equal(ok(estimate(value, '2028-02-28')).days_before, 2);
  assert.equal(ok(estimate(value, '2028-02-29')).days_before, 1);
});
test('band order does not change threshold meaning; percentages come only from supplied rules', () => {
  assert.equal(ok(estimate(accepted(policy({ refund_bands: [{ days_before: 0, refund_pct: 25 }, { days_before: 7, refund_pct: 75 }] })))).refund.amount, 75);
  assert.equal(ok(estimate(accepted(policy({ refund_bands: [{ days_before: 0, refund_pct: 10 }] })))).refund.amount, 10);
});
test('missing config, missing bands, out-of-band and after-trip dates never invent refund rules', () => {
  assert.deepEqual(estimate(accepted(policy(), null)), { status: 'unavailable', reason: 'estimation_configuration_missing' });
  assert.deepEqual(estimate(accepted(policy({ refund_bands: [] }))), { status: 'unavailable', reason: 'no_applicable_refund_band' });
  assert.equal(estimate(accepted(policy({ refund_bands: [{ days_before: 8, refund_pct: 80 }] }))).status, 'unavailable');
  assert.deepEqual(estimate(accepted(), '2028-03-11'), { status: 'unavailable', reason: 'cancellation_after_trip_start' });
  assert.equal(ok(estimate(accepted(policy({ refund_bands: [{ days_before: 0, refund_pct: 0 }] })))).refund.amount, 0);
});
test('rounding is exact for ties and fractions, with 100 as fixed percentage denominator', () => {
  const cases: readonly [number, number, EstimationConfig['rounding'], number][] = [
    [1, 50, 'floor', 0], [1, 50, 'ceil', 1], [1, 50, 'half_up', 1], [1, 50, 'half_even', 0],
    [3, 50, 'half_even', 2], [5, 50, 'half_even', 2], [7, 50, 'half_even', 4],
    [1, 49, 'half_up', 0], [1, 51, 'half_even', 1], [100, 50, 'ceil', 50],
    [0, 100, 'ceil', 0], [Number.MAX_SAFE_INTEGER, 100, 'ceil', Number.MAX_SAFE_INTEGER],
    [Number.MAX_SAFE_INTEGER, 99, 'floor', 8917127262193581],
  ];
  for (const [amount, percent, rounding, expected] of cases) {
    const raw = request(policy({ refund_bands: [{ days_before: 0, refund_pct: percent }] }));
    raw.acceptance.amount.amount = amount;
    const value = ok(preparePolicySnapshot({ ...raw, estimation: estimation({ rounding }) })).snapshot;
    assert.equal(ok(estimate(value, '2028-03-03', amount)).refund.amount, expected, `${amount}/${percent}/${rounding}`);
  }
});
test('explicit accepted/captured bases differ and refunds are capped to captured money', () => {
  const base = policy({ refund_bands: [{ days_before: 0, refund_pct: 75 }] });
  const acceptedBase = ok(estimate(accepted(base), '2028-03-03', 40));
  assert.equal(acceptedBase.refund.amount, 40);
  assert.equal(acceptedBase.capped, true);
  assert.equal(acceptedBase.percentage_basis.amount, 101);
  const capturedBase = ok(estimate(accepted(base, estimation({ percentage_basis: 'captured' })), '2028-03-03', 40));
  assert.equal(capturedBase.refund.amount, 30);
  assert.equal(capturedBase.capped, false);
  assert.equal(ok(estimate(accepted(base), '2028-03-03', 0)).refund.amount, 0);
});
test('unsafe, fractional, nonfinite, negative and currency-invalid money never reaches arithmetic', () => {
  const raw = request();
  for (const amount of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '101']) {
    invalid(preparePolicySnapshot({ ...raw, acceptance: { ...raw.acceptance, amount: { amount, currency: 'INR' } } }));
    invalid(estimateRefund({ snapshot: accepted(), cancellation_date: '2028-03-03', trip_start_date: '2028-03-10', captured_amount: { amount, currency: 'INR' } }));
  }
  for (const currency of ['JPY', 'inr', '', null]) invalid(preparePolicySnapshot({ ...raw, acceptance: { ...raw.acceptance, amount: { amount: 101, currency } } }));
  for (const currency of ['INR', 'USD', 'EUR', 'GBP', 'AED']) {
    const snap = ok(preparePolicySnapshot({ ...raw, acceptance: { ...raw.acceptance, amount: { amount: 101, currency } } })).snapshot;
    assert.equal(ok(estimate(snap)).refund.currency, currency);
  }
  invalid(estimateRefund({ snapshot: accepted(), cancellation_date: '2028-03-03', trip_start_date: '2028-03-10', captured_amount: { amount: 101, currency: 'USD' } }), /currency/);
  invalid(estimate(accepted(), '2028-03-03', 102), /exceeds/);
  invalid(preparePolicySnapshot({ ...raw, acceptance: { ...raw.acceptance, amount: { amount: 101, currency: 'INR', fee: 1 } } }));
});
test('invalid snapshot/date inputs and changed accepted trip dates are rejected', () => {
  const base = { snapshot: accepted(), cancellation_date: '2028-03-03', trip_start_date: '2028-03-10', captured_amount: { amount: 101, currency: 'INR' } };
  for (const input of [
    { ...base, trip_start_date: '2028-03-11' }, { ...base, cancellation_date: '2028-02-30' },
    { ...base, cancellation_date: '2028-01-31' }, { ...base, extra: true },
    { ...base, snapshot: { ...base.snapshot, policy: { ...base.snapshot.policy, version: 0 } } },
    { ...base, snapshot: { ...base.snapshot, resolution: { ...resolution(), scopes: ['partner'] } } },
  ]) invalid(estimateRefund(input));
});
test('missing/malformed estimation decisions disable or reject rather than silently default', () => {
  const raw = request();
  const { estimation: omitted, ...withoutConfig } = raw;
  assert.ok(omitted);
  assert.equal(estimate(ok(preparePolicySnapshot(withoutConfig)).snapshot).status, 'unavailable');
  for (const config of [{}, { ...estimation(), rounding: 'nearest' }, { ...estimation(), percentage_basis: 'supplier' }, { ...estimation(), peak_basis: 'server_today' }, { ...estimation(), peak_end: undefined }, { ...estimation(), percentage_denominator: 1000 }]) invalid(preparePolicySnapshot({ ...raw, estimation: config }));
});
test('peak override uses configured date basis and exact inclusive/exclusive boundary', () => {
  const selected = policy({ peak_overrides: [{ from: '2028-03-10', to: '2028-03-10', refund_bands: [{ days_before: 0, refund_pct: 10 }] }] });
  const inclusive = ok(estimate(accepted(selected)));
  assert.equal(inclusive.source, 'peak');
  assert.equal(inclusive.refund.amount, 10);
  assert.equal(ok(estimate(accepted(selected, estimation({ peak_end: 'exclusive' })))).source, 'base');
  assert.equal(ok(estimate(accepted(selected, estimation({ peak_basis: 'cancellation_date' })))).source, 'base');
  assert.equal(ok(estimate(accepted(selected, estimation({ peak_basis: 'cancellation_date' })), '2028-03-10')).source, 'peak');
});
test('peak from/to boundaries and shared endpoints are explicit rather than data-order selection', () => {
  const selected = policy({ peak_overrides: [
    { from: '2028-03-02', to: '2028-03-03', refund_bands: [{ days_before: 0, refund_pct: 10 }] },
    { from: '2028-03-03', to: '2028-03-04', refund_bands: [{ days_before: 0, refund_pct: 20 }] },
  ] });
  const value = accepted(selected, estimation({ peak_basis: 'cancellation_date' }));
  assert.equal(ok(estimate(value, '2028-03-01')).source, 'base');
  assert.equal(ok(estimate(value, '2028-03-02')).refund.amount, 10);
  assert.deepEqual(estimate(value, '2028-03-03'), { status: 'ambiguous', reason: 'overlapping_peak_overrides' });
  assert.equal(ok(estimate(value, '2028-03-04')).refund.amount, 20);
  assert.equal(ok(estimate(value, '2028-03-05')).source, 'base');
  const exclusive = accepted(selected, estimation({ peak_basis: 'cancellation_date', peak_end: 'exclusive' }));
  assert.equal(ok(estimate(exclusive, '2028-03-03')).refund.amount, 20);
  assert.equal(ok(estimate(exclusive, '2028-03-04')).source, 'base');
});
test('applicable peak with empty/inapplicable bands does not fall back to base refund', () => {
  for (const refundBands of [[], [{ days_before: 8, refund_pct: 80 }]]) {
    assert.deepEqual(estimate(accepted(policy({ peak_overrides: [{ from: '2028-03-01', to: '2028-03-31', refund_bands: refundBands }] }))), { status: 'unavailable', reason: 'no_applicable_peak_refund_band' });
  }
});
