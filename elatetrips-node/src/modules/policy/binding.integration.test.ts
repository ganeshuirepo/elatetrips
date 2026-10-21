import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { after, before, test } from 'node:test';
import { mongo } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { openPolicySnapshotStore, type PolicyBookingBinding, type PolicySnapshotOptions, type PolicySnapshotCommand } from '../foundation/policy-snapshot';
import { openPolicyBindingService, createPolicyProducerValidator, preparePolicySnapshot } from './index';
import type { PolicyBindingIntent, PolicyAcceptanceAuthority, PolicyAcceptanceEvidence, OwnedPolicy, PolicySnapshot } from './index';

let replica: MongoMemoryReplSet;
let client: mongo.MongoClient;
before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  client = await new mongo.MongoClient(replica.getUri()).connect();
});
after(async () => { await client?.close(); await replica?.stop(); });
let fixtureNumber = 0;
function fixture() {
  fixtureNumber += 1;
  const database = `fixture_policy_binding_${fixtureNumber}`;
  const intent: PolicyBindingIntent = {
    commandId: 'fixture-command', correlationId: 'fixture-correlation', snapshotId: 'fixture-snapshot', eventId: 'fixture-domain-event',
    bookingId: 'fixture-booking', contextId: 'fixture-context', tenantId: 'fixture-tenant', quoteId: 'fixture-quote', partnerId: 'fixture-partner',
    actorId: 'fixture-user', actor: 'ops', role: 'ops', acceptanceId: 'fixture-acceptance', acceptanceRevision: 1,
    rfqId: 'fixture-rfq', businessDate: '2028-02-01', tripStartDate: '2028-03-10', policyId: 'fixture-sensitive-policy', policyVersion: 1,
    amount: { amount: 10000, currency: 'INR' },
    resolution: { version: 'fixture-resolution', scopes: ['quote', 'partner', 'platform_default'], fallback: 'allow', effective_to: 'inclusive' },
    estimation: { version: 'fixture-estimation', rounding: 'floor', percentage_basis: 'accepted', peak_basis: 'trip_start_date', peak_end: 'inclusive' },
  };
  const originalCatalog: OwnedPolicy[] = [{ tenant_id: intent.tenantId, policy: {
    policy_id: intent.policyId, version: 1, scope: 'quote', partner_id: intent.partnerId, quote_id: intent.quoteId,
    effective_from: '2028-01-01', effective_to: '2028-02-29', refund_bands: [{ days_before: 7, refund_pct: 75 }, { days_before: 0, refund_pct: 20 }],
  } }];
  const evidence: PolicyAcceptanceEvidence = { issuer: 'fixture-trusted-register', recordId: intent.acceptanceId, revision: 1, proof: 'fixture-private-human-record-reference' };
  function acceptedSnapshot(value: PolicyBindingIntent): PolicySnapshot {
    const prepared = preparePolicySnapshot({
      catalog: originalCatalog, context: { tenant_id: value.tenantId, quote_id: value.quoteId, partner_id: value.partnerId, business_date: value.businessDate }, resolution: value.resolution, estimation: value.estimation,
      acceptance: { booking_id: value.bookingId, rfq_id: value.rfqId, trip_start_date: value.tripStartDate, amount: value.amount, policy_id: value.policyId, policy_version: value.policyVersion },
      audit: { command_id: value.commandId, event_id: value.eventId, actor: value.actor, actor_id: value.actorId, role: value.role, ts: '2028-02-01T00:00:00.000Z' },
    });
    if (prepared.status !== 'ok') throw new Error('Invalid fixture acceptance');
    return prepared.value.snapshot;
  }
  const records = new Map([[intent.acceptanceId, { intent: structuredClone(intent), evidence: structuredClone(evidence), snapshot: acceptedSnapshot(intent) }]]);
  const state = { active: true, scope: 'fixture-organization', read: true, write: true, drift: false, loadCalls: 0, clockCalls: 0, currentCatalog: originalCatalog, barrier: false, raceCatalogChange: false, catalogLengths: new Array<number>() };
  let release: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const authority: PolicyAcceptanceAuthority = {
    load: async (id, revision) => {
      state.loadCalls += 1;
      if (state.raceCatalogChange && state.loadCalls === 2) state.currentCatalog = [...originalCatalog, { tenant_id: intent.tenantId, policy: { policy_id: 'fixture-next-policy', version: 2, scope: 'quote', partner_id: intent.partnerId, quote_id: intent.quoteId, effective_from: '2029-01-01', effective_to: '2029-02-28', refund_bands: [] } }];
      const currentCatalog = state.currentCatalog;
      state.catalogLengths.push(currentCatalog.length);
      if (state.barrier) { if (state.loadCalls === 2) release?.(); await barrier; }
      const saved = records.get(id);
      if (saved === undefined || saved.evidence.revision !== revision) return null;
      return { intent: structuredClone(saved.intent), evidence: structuredClone(saved.evidence), catalog: currentCatalog };
    },
    verify: (proof, requested, accepted) => {
      const saved = records.get(proof.recordId);
      return saved !== undefined && isDeepStrictEqual(proof, saved.evidence) && isDeepStrictEqual(requested, saved.intent) && isDeepStrictEqual(accepted, saved.snapshot);
    },
  };
  const binding: PolicyBookingBinding = { bookingId: intent.bookingId, quoteId: intent.quoteId, partnerId: intent.partnerId, tenantId: intent.tenantId, contextId: intent.contextId, scope: { kind: 'organization', id: 'fixture-organization' }, eventActor: 'ops', eventRole: 'ops' };
  const foundation: Omit<PolicySnapshotOptions, 'validateProducer'> = {
    client, database, namespace: 'fixture_policy_binding',
    keys: { activeKeyId: 'fixture-key', encryptionKeys: new Map([['fixture-key', randomBytes(32)]]), fingerprintKey: randomBytes(32) },
    clock: () => '2028-02-01T00:00:00.000Z', tokens: { sign: () => '', verify: (token) => ({ phone: token }) },
    accounts: { findByTokenIdentifier: async (identifier) => ({ userId: identifier === 'fixture-bearer-sensitive' ? 'fixture-user' : 'fixture-foreign-user', active: state.active }) },
    memberships: { listForUser: async (userId) => [{ membershipId: 'fixture-membership', userId, scope: { kind: 'organization', id: state.scope }, role: 'ops', active: true, validFrom: null, expiresAt: null }] },
    loadPermissions: async () => ({ policyId: 'fixture-permissions', revision: 1, grants: [...(state.read ? [{ action: 'booking.read', roles: ['ops'] }] : []), ...(state.write ? [{ action: 'booking.write', roles: ['ops'] }] : [])] }),
    configuration: { adapterId: 'fixture-binding', revision: 1, readAction: 'booking.read', writeAction: 'booking.write', transaction: { policyId: 'fixture-transaction', revision: 1, maxRecords: 2 } },
    resolveBooking: async (bookingId) => ({ ...binding, bookingId, contextId: state.drift ? 'fixture-drift' : binding.contextId }),
  };
  const options = { foundation, acceptance: authority, proposalClock: () => { state.clockCalls += 1; return `2028-02-01T00:00:0${state.clockCalls}.000Z`; } };
  return { database, intent, state, options, records, evidence, acceptedSnapshot, authority, foundation };
}
const token = 'fixture-bearer-sensitive';
function hasCode(code: string) { return (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === code; }
async function rawRows(database: string) {
  const collections = await client.db(database).listCollections().toArray();
  return Promise.all(collections.map(async (collection) => ({ name: collection.name, rows: await client.db(database).collection(collection.name).find().toArray() })));
}

test('durable snapshot is detached/frozen; encrypted rows contain two internal audits/outbox reservations and one canonical event', async () => {
  const f = fixture(); const service = await openPolicyBindingService(f.options);
  const result = await service.accept(token, f.intent);
  assert.equal(result.event.type, 'policy.snapshotted');
  assert.deepEqual(result.event.after, result.snapshot.body);
  assert.deepEqual(result.event.payload, { booking_id: f.intent.bookingId, policy_id: f.intent.policyId, version: 1 });
  assert.equal(Object.isFrozen(result.snapshot), true);
  assert.equal(Object.isFrozen(result.snapshot.body), true);
  assert.equal(JSON.stringify(result).includes(token), false);
  const rows = await rawRows(f.database);
  const raw = JSON.stringify(rows);
  assert.equal(raw.includes(f.intent.policyId), false);
  assert.equal(raw.includes(f.evidence.proof), false);
  assert.equal(raw.includes(token), false);
  assert.ok(rows.some((collection) => collection.name.includes('audit') && collection.rows.length === 2));
  assert.ok(rows.some((collection) => collection.name.includes('outbox') && collection.rows.length === 2));
  assert.deepEqual(await service.read(token, f.intent.bookingId), result);
});

test('saved retry and estimator preserve old terms without accepted-record load, proposal creation or clock', async () => {
  const f = fixture(); const service = await openPolicyBindingService(f.options);
  const result = await service.accept(token, f.intent);
  f.state.currentCatalog = []; f.options.proposalClock = () => { throw new Error('Replay clock forbidden'); };
  f.authority.load = async () => { throw new Error('Replay catalog forbidden'); };
  assert.deepEqual(await service.accept(token, structuredClone(f.intent)), result);
  const estimate = await service.estimate(token, f.intent.bookingId, { cancellation_date: '2028-03-03', captured_amount: f.intent.amount });
  assert.equal(estimate.status, 'ok');
  if (estimate.status === 'ok' && 'value' in estimate) assert.equal(estimate.value.refund.amount, 7500);
  assert.equal(f.state.clockCalls, 1);
});

const changedIntents: readonly [string, Partial<PolicyBindingIntent>][] = [
  ['amount', { amount: { amount: 999, currency: 'INR' } }], ['currency', { amount: { amount: 10000, currency: 'USD' } }],
  ['accepted reference', { acceptanceId: 'other' }], ['revision', { acceptanceRevision: 2 }], ['actor', { actorId: 'other' }],
  ['context', { contextId: 'other' }], ['policy', { policyVersion: 2 }], ['event', { eventId: 'other' }],
  ['config', { estimation: null }], ['quote', { quoteId: 'other' }], ['partner', { partnerId: 'other' }],
];
for (const [name, changed] of changedIntents) test(`saved retry conflicts on changed ${name}`, async () => {
  const f = fixture(); const service = await openPolicyBindingService(f.options); await service.accept(token, f.intent);
  await assert.rejects(service.accept(token, { ...f.intent, ...changed }), hasCode('IDEMPOTENCY_CONFLICT'));
});

test('foreign scope, revoked identity, read-only replay and changed actor cannot return saved acceptance', async () => {
  const f = fixture(); const service = await openPolicyBindingService(f.options); await service.accept(token, f.intent);
  f.state.scope = 'foreign';
  await assert.rejects(service.accept(token, f.intent)); await assert.rejects(service.read(token, f.intent.bookingId));
  f.state.scope = 'fixture-organization'; f.state.active = false;
  await assert.rejects(service.accept(token, f.intent)); await assert.rejects(service.estimate(token, f.intent.bookingId, { cancellation_date: '2028-03-03', captured_amount: f.intent.amount }));
  f.state.active = true; f.state.write = false;
  assert.ok(await service.read(token, f.intent.bookingId)); await assert.rejects(service.accept(token, f.intent));
  f.state.write = true;
  await assert.rejects(service.accept('foreign-token', f.intent));
});

test('initial scope denial does not load acceptance; authoritative mapping drift cannot persist or replay', async () => {
  const f = fixture(); const service = await openPolicyBindingService(f.options);
  f.state.scope = 'foreign'; await assert.rejects(service.accept(token, f.intent)); assert.equal(f.state.loadCalls, 0);
  f.state.scope = 'fixture-organization'; f.state.drift = true;
  await assert.rejects(service.accept(token, f.intent));
  assert.equal(await service.read(token, f.intent.bookingId), null);
  f.state.drift = false; await service.accept(token, f.intent); f.state.drift = true;
  await assert.rejects(service.read(token, f.intent.bookingId));
});

test('simultaneous identical requests reconcile original winner despite different server times and catalog reads', async () => {
  const f = fixture(); f.state.barrier = true; f.state.raceCatalogChange = true;
  const first = await openPolicyBindingService(f.options); const second = await openPolicyBindingService(f.options);
  const [left, right] = await Promise.all([first.accept(token, f.intent), second.accept(token, structuredClone(f.intent))]);
  assert.deepEqual(left, right); assert.equal(f.state.clockCalls, 2); assert.equal(f.state.loadCalls, 2);
  assert.deepEqual(f.state.catalogLengths, [1, 2]);
  const rows = await rawRows(f.database);
  assert.ok(rows.some((collection) => collection.name.includes('audit') && collection.rows.length === 2));
});

test('simultaneous different accepted intent has one winner and one conflict', async () => {
  const f = fixture(); f.state.barrier = true;
  const other = { ...structuredClone(f.intent), acceptanceId: 'fixture-other-acceptance', amount: { amount: 20000, currency: f.intent.amount.currency } };
  f.records.set(other.acceptanceId, { intent: other, evidence: { ...f.evidence, recordId: other.acceptanceId }, snapshot: f.acceptedSnapshot(other) });
  const service = await openPolicyBindingService(f.options);
  const outcomes = await Promise.allSettled([service.accept(token, f.intent), service.accept(token, other)]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((result) => result.status === 'rejected').length, 1);
});

test('strict validator rejects malformed proposal, projection changes and forged JSON evidence', async () => {
  const f = fixture(); const service = await openPolicyBindingService(f.options); const accepted = await service.accept(token, f.intent);
  const validate = createPolicyProducerValidator(f.authority);
  assert.equal(validate(accepted.snapshot), true);
  assert.equal(validate({ ...accepted.snapshot, contextId: 'other' }), false);
  assert.equal(validate({ ...accepted.snapshot, body: { format: 'policy-binding-v1' } }), false);
  const root = accepted.snapshot.body;
  assert.ok(typeof root === 'object' && root !== null && 'proposal' in root && 'evidence' in root);
  if (typeof root !== 'object' || root === null || !('proposal' in root)) throw new Error('Missing body');
  assert.equal(validate({ ...accepted.snapshot, body: { ...root, evidence: { ...f.evidence, proof: 'forged' } } }), false);
  assert.equal(validate({ ...accepted.snapshot, body: { ...root, proposal: { arbitrary: true } } }), false);
  const store = await openPolicySnapshotStore({ ...f.foundation, validateProducer: validate });
  const bad: PolicySnapshotCommand = { commandId: f.intent.commandId, correlationId: f.intent.correlationId, snapshot: { ...accepted.snapshot, body: { ...root, evidence: { ...f.evidence, proof: 'forged' } } }, event: { ...accepted.event, after: { ...root, evidence: { ...f.evidence, proof: 'forged' } } } };
  await assert.rejects(store.commit(token, bad));
});

test('caller nested data is cloned before asynchronous authorization', async () => {
  const f = fixture(); const service = await openPolicyBindingService(f.options);
  const request = structuredClone(f.intent); const pending = service.accept(token, request); request.amount = { amount: 1, currency: 'USD' };
  const accepted = await pending;
  assert.ok(JSON.stringify(accepted.snapshot.body).includes('10000'));
  assert.equal(f.intent.amount.amount, 10000);
});

test('missing or invalid trusted acceptance/configuration disables commit without partial persistence', async () => {
  const f = fixture(); f.authority.load = async () => null;
  const service = await openPolicyBindingService(f.options);
  await assert.rejects(service.accept(token, f.intent), hasCode('ACCEPTANCE_UNAVAILABLE'));
  assert.equal(await service.read(token, f.intent.bookingId), null);
  const invalid = fixture(); invalid.authority.verify = () => false;
  const denied = await openPolicyBindingService(invalid.options);
  await assert.rejects(denied.accept(token, invalid.intent), hasCode('PROVENANCE_INVALID'));
  assert.equal(await denied.read(token, invalid.intent.bookingId), null);
  await assert.rejects(openPolicyBindingService({ ...f.options, foundation: { ...f.foundation, configuration: { ...f.foundation.configuration, transaction: { ...f.foundation.configuration.transaction, maxRecords: 1 } } } }));
});

test('event reservation collision rolls back the second booking through public store API', async () => {
  const f = fixture(); const service = await openPolicyBindingService(f.options); await service.accept(token, f.intent);
  const other = { ...structuredClone(f.intent), bookingId: 'fixture-second-booking', commandId: 'fixture-second-command', snapshotId: 'fixture-second-snapshot', acceptanceId: 'fixture-second-acceptance' };
  f.records.set(other.acceptanceId, { intent: other, evidence: { ...f.evidence, recordId: other.acceptanceId }, snapshot: f.acceptedSnapshot(other) });
  await assert.rejects(service.accept(token, other));
  assert.equal(await service.read(token, other.bookingId), null);
  const rows = await rawRows(f.database);
  assert.ok(rows.some((collection) => collection.name.includes('audit') && collection.rows.length === 2));
  assert.ok(rows.some((collection) => collection.name.includes('outbox') && collection.rows.length === 2));
});


test('strict saved producer validation rejects full-body/event mutations and unknown nested fields', async () => {
  const f = fixture(); const service = await openPolicyBindingService(f.options); const accepted = await service.accept(token, f.intent);
  const validate = createPolicyProducerValidator(f.authority);
  const root = accepted.snapshot.body;
  if (typeof root !== 'object' || root === null || !('proposal' in root)) throw new Error('Missing fixture body');
  const proposal = root.proposal;
  if (typeof proposal !== 'object' || proposal === null || !('event' in proposal) || !('snapshot' in proposal)) throw new Error('Missing fixture proposal');
  const event = proposal.event;
  if (typeof event !== 'object' || event === null || !('payload' in event) || !('after' in event)) throw new Error('Missing fixture event');
  const payload = event.payload;
  if (typeof payload !== 'object' || payload === null) throw new Error('Missing fixture payload');
  const changes = [
    { ...root, extra: true },
    { ...root, proposal: { ...proposal, fingerprint: 'forged-sha' } },
    { ...root, proposal: { ...proposal, event: { ...event, type: 'booking.confirmed' } } },
    { ...root, proposal: { ...proposal, event: { ...event, payload: { ...payload, version: 2 } } } },
    { ...root, proposal: { ...proposal, event: { ...event, payload: { ...payload, extra: true } } } },
    { ...root, proposal: { ...proposal, event: { ...event, after: { policy_snapshot: proposal.snapshot, extra: true } } } },
    { ...root, intent: { ...f.intent, amount: { amount: 1, currency: 'INR' } } },
  ];
  for (const changed of changes) assert.equal(validate({ ...accepted.snapshot, body: changed }), false);
});

test('authoritative catalog terms need exact accepted provenance and authoritative intent must match', async () => {
  const f = fixture(); const service = await openPolicyBindingService(f.options);
  f.state.currentCatalog = f.state.currentCatalog.map((owner) => ({ ...owner, policy: { ...owner.policy, refund_bands: [{ days_before: 0, refund_pct: 100 }] } }));
  await assert.rejects(service.accept(token, f.intent), hasCode('PROVENANCE_INVALID'));
  assert.equal(await service.read(token, f.intent.bookingId), null);
  const other = fixture();
  other.authority.load = async () => ({ intent: { ...other.intent, policyVersion: 2 }, catalog: other.state.currentCatalog, evidence: other.evidence });
  const denied = await openPolicyBindingService(other.options);
  await assert.rejects(denied.accept(token, other.intent), hasCode('PROVENANCE_INVALID'));
  assert.equal(await denied.read(token, other.intent.bookingId), null);
});

test('reopened binding uses original saved command and rejects changed durable adapter configuration', async () => {
  const f = fixture(); const service = await openPolicyBindingService(f.options); const original = await service.accept(token, f.intent);
  f.authority.load = async () => { throw new Error('Saved retry must not reload'); };
  const reopened = await openPolicyBindingService({ ...f.options, proposalClock: () => { throw new Error('Saved retry must not use clock'); } });
  assert.deepEqual(await reopened.accept(token, f.intent), original);
  const changed = await openPolicyBindingService({ ...f.options, foundation: { ...f.foundation, configuration: { ...f.foundation.configuration, revision: 2 } } });
  await assert.rejects(changed.accept(token, f.intent));
});
