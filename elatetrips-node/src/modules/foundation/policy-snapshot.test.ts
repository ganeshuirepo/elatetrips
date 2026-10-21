import { strict as assert } from 'node:assert';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { mongo } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { z } from 'zod';
import { canonicalJson, createJsonProtection } from './encrypted-json';
import { authenticateFoundationEvent } from './foundation-event';
import { FoundationStoreError } from './persistence';
import { openPolicySnapshotStore, snapshotPolicySchema, type PolicySnapshotCommand, type PolicySnapshotOptions } from './policy-snapshot';

const now = '2026-10-21T12:00:00.000Z';
const scope = { kind: 'organization' as const, id: 'fixture-organization' };
const bodySchema = z.object({
  snapshotId: z.string(), bookingId: z.string(), quoteId: z.string(), partnerId: z.string(),
  tenantId: z.string(), contextId: z.string(), policy: snapshotPolicySchema,
  acceptanceEvidence: z.string(),
}).strict();
function command(bookingId = 'booking-a'): PolicySnapshotCommand {
  const body = {
    snapshotId: `snapshot-${bookingId}`, bookingId, quoteId: `quote-${bookingId}`, partnerId: 'partner-a',
    tenantId: 'tenant-a', contextId: `context-${bookingId}`,
    policy: { policy_id: 'policy-a', version: 4, scope: 'quote' as const, quote_id: `quote-${bookingId}`,
      effective_from: '2026-10-01', refund_bands: [{ days_before: 7, refund_pct: 63 }] },
    acceptanceEvidence: 'PRIVATE-SYNTHETIC-EVIDENCE',
  };
  return {
    commandId: `command-${bookingId}`, correlationId: 'flow-a', snapshot: {
      snapshotId: body.snapshotId, bookingId, quoteId: body.quoteId, partnerId: body.partnerId,
      tenantId: body.tenantId, contextId: body.contextId, policy: body.policy, body,
    },
    event: { event_id: `event-${bookingId}`, type: 'policy.snapshotted', actor: 'ops', actor_id: 'user-a', role: 'ops', ts: now,
      subject: { booking_id: bookingId, quote_id: body.quoteId }, before: null, after: body,
      payload: { booking_id: bookingId, policy_id: body.policy.policy_id, version: body.policy.version } },
  };
}
function code(...expected: string[]) {
  return (error: unknown) => error instanceof FoundationStoreError && expected.includes(error.code) && error.message === error.code;
}
describe('durable write-once policy snapshot seam (real local Mongo)', () => {
  let replica: MongoMemoryReplSet;
  let client: mongo.MongoClient;
  const database = `policy_test_${randomUUID().replace(/-/g, '')}`;
  before(async () => {
    replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    client = await new mongo.MongoClient(replica.getUri()).connect();
  });
  after(async () => { await client?.close(); await replica?.stop(); });
  async function fixture() {
    const namespace = `p_${randomUUID().replace(/-/g, '')}`;
    let accountActive = true;
    let membershipActive = true;
    let foreign = false;
    let role = 'ops';
    let user = 'user-a';
    let permissionRevision = 1;
    let producerAccepts = true;
    let onBooking: (() => void) | undefined;
    const options: PolicySnapshotOptions = {
      client, database, namespace, clock: () => now,
      keys: { activeKeyId: 'fixture-key', encryptionKeys: new Map([['fixture-key', randomBytes(32)]]), fingerprintKey: randomBytes(32) },
      tokens: { sign: () => '', verify: () => ({ phone: 'fixture-token-identifier' }) },
      accounts: { findByTokenIdentifier: async () => ({ userId: user, active: accountActive }) },
      memberships: { listForUser: async (userId) => [{ membershipId: 'member-a', userId, scope: foreign ? { ...scope, id: 'foreign' } : scope,
        role, active: membershipActive, validFrom: null, expiresAt: null }] },
      loadPermissions: async () => ({ policyId: 'permissions', revision: permissionRevision,
        grants: ['booking.read', 'booking.write'].map((action) => ({ action, roles: ['ops', 'admin'] })) }),
      configuration: { adapterId: 'fixture-producer', revision: 1, readAction: 'booking.read', writeAction: 'booking.write',
        transaction: { policyId: 'policy-commit', revision: 1, maxRecords: 2 } },
      resolveBooking: async (bookingId) => {
        onBooking?.(); onBooking = undefined;
        return { bookingId, quoteId: `quote-${bookingId}`, contextId: `context-${bookingId}`, tenantId: 'tenant-a', partnerId: 'partner-a',
          scope, eventActor: 'ops', eventRole: 'ops' };
      },
      validateProducer: (snapshot) => {
        const parsed = bodySchema.safeParse(snapshot.body);
        const { body, ...metadata } = snapshot;
        return producerAccepts && parsed.success && parsed.data.acceptanceEvidence.length > 0 &&
          canonicalJson({ ...metadata, acceptanceEvidence: parsed.data.acceptanceEvidence }) === canonicalJson(body);
      },
    };
    const store = await openPolicySnapshotStore(options);
    const collection = (suffix: string) => client.db(database).collection(`${namespace}_${suffix}`);
    const counts = () => Promise.all(['records', 'revisions', 'audit', 'outbox', 'receipts', 'transaction_receipts'].map((s) => collection(s).countDocuments()));
    return { store, options, collection, counts,
      account: (active: boolean) => { accountActive = active; }, membership: (active: boolean) => { membershipActive = active; },
      foreign: () => { foreign = true; }, actor: (value: string) => { user = value; }, role: (value: string) => { role = value; },
      permissions: () => { permissionRevision++; }, producer: () => { producerAccepts = false; },
      onBooking: (callback: () => void) => { onBooking = callback; },
    };
  }
  it('commits, freshly reads and reopens the original durable result', async () => {
    const f = await fixture();
    const result = await f.store.commit('token', command());
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
    assert.deepEqual(await f.store.read('token', 'booking-a'), result);
    const reopened = await openPolicySnapshotStore(f.options);
    assert.deepEqual(await reopened.commit('token', command()), result);
    assert.deepEqual(await reopened.read('token', 'booking-a'), result);
  });
  it('stores no plaintext snapshot or audit and encrypts the durable receipt', async () => {
    const f = await fixture(); await f.store.commit('token', command());
    for (const suffix of ['records', 'revisions', 'audit', 'transaction_receipts']) {
      const raw = JSON.stringify(await f.collection(suffix).find().toArray());
      assert(!raw.includes('PRIVATE-SYNTHETIC-EVIDENCE'));
      assert(!raw.includes('refund_pct'));
      assert(raw.includes('ciphertext'));
    }
  });
  it('publishes one canonical policy payload and a reference-only internal reservation audit', async () => {
    const f = await fixture(); await f.store.commit('token', command()); await f.store.commit('token', command());
    const protection = createJsonProtection(f.options.keys);
    const rows = await f.collection('audit').find().toArray();
    const events = rows.map((row) => {
      const parsed = z.object({ _id: z.string() }).passthrough().parse(row);
      return authenticateFoundationEvent(row, protection, { database, namespace: f.options.namespace, eventId: parsed._id });
    });
    const canonical = events.filter((event) => event.kind === 'policy-snapshot');
    assert.equal(canonical.length, 1);
    const envelope = z.object({ request: z.object({ event: z.unknown() }) }).parse(canonical[0].after);
    assert.deepEqual(envelope.request.event, command().event);
    const reservation = events.find((event) => event.kind === 'policy-snapshot-event');
    assert(reservation);
    assert(!canonicalJson(reservation.after).includes('policy.snapshotted'));
    assert.equal(await f.collection('outbox').countDocuments(), 2);
  });
  it('returns an independent recursively frozen result and detaches caller input before IO', async () => {
    const f = await fixture(); const input = command();
    f.onBooking(() => { input.snapshot.policy.refund_bands[0].refund_pct = 12; input.event.payload.version = 9; });
    const accepted = await f.store.commit('token', input);
    assert.equal(accepted.snapshot.policy.refund_bands[0].refund_pct, 63);
    assert.throws(() => { accepted.snapshot.policy.refund_bands[0].refund_pct = 99; }, TypeError);
    assert.deepEqual(await f.store.read('token', 'booking-a'), accepted);
    assert.notEqual((await f.store.read('token', 'booking-a'))?.snapshot, accepted.snapshot);
  });
  it('preserves accepted terms after caller catalog/source changes', async () => {
    const f = await fixture(); const source = command(); const accepted = await f.store.commit('token', source);
    source.snapshot.policy.refund_bands.splice(0); source.snapshot.policy.version++;
    assert.deepEqual(await f.store.read('token', 'booking-a'), accepted);
  });
  it('retries exactly without adding records, audits or outbox entries', async () => {
    const f = await fixture(); const first = await f.store.commit('token', command());
    assert.deepEqual(await f.store.commit('token', command()), first);
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
  });
  for (const mutation of ['body', 'event', 'correlation', 'configuration', 'permission', 'role'] as const) {
    it(`conflicts on changed ${mutation} under the original command`, async () => {
      const f = await fixture(); await f.store.commit('token', command());
      const changed = command(); let store = f.store;
      if (mutation === 'body') {
        const body = bodySchema.parse(changed.snapshot.body); body.acceptanceEvidence = 'changed-trusted-evidence';
        changed.snapshot.body = body; changed.event.after = body;
      }
      if (mutation === 'event') changed.event.ts = '2026-10-21T12:01:00.000Z';
      if (mutation === 'correlation') changed.correlationId = 'changed-flow';
      if (mutation === 'configuration') store = await openPolicySnapshotStore({ ...f.options, configuration: { ...f.options.configuration, revision: 2 } });
      if (mutation === 'permission') f.permissions();
      if (mutation === 'role') f.role('admin');
      await assert.rejects(store.commit('token', changed), code('IDEMPOTENCY_CONFLICT'));
      assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
    });
  }
  it('denies competing commands for an accepted booking', async () => {
    const f = await fixture(); await f.store.commit('token', command()); const other = command(); other.commandId = 'competing';
    await assert.rejects(f.store.commit('token', other), code('REVISION_CONFLICT', 'RECORD_IMMUTABLE'));
  });
  for (const reused of ['command', 'event'] as const) {
    it(`denies ${reused} reuse across different bookings`, async () => {
      const f = await fixture(); const first = command(); await f.store.commit('token', first); const second = command('booking-b');
      if (reused === 'command') second.commandId = first.commandId; else second.event.event_id = first.event.event_id;
      await assert.rejects(f.store.commit('token', second), code('IDEMPOTENCY_CONFLICT', 'REVISION_CONFLICT'));
      assert.equal(await f.store.read('token', 'booking-b'), null);
      assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
    });
  }
  it('coalesces simultaneous exact first commits using durable receipts', async () => {
    const f = await fixture(); const values = await Promise.all(Array.from({ length: 5 }, () => f.store.commit('token', command())));
    for (const value of values) assert.deepEqual(value, values[0]);
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
  });
  it('accepts only one simultaneous competing booking command', async () => {
    const f = await fixture(); const a = command(); const b = command(); b.commandId = 'competitor'; b.event.event_id = 'competitor-event';
    const results = await Promise.allSettled([f.store.commit('token', a), f.store.commit('token', b)]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
  });
  it('accepts only one simultaneous cross-booking claim for the same event ID', async () => {
    const f = await fixture(); const a = command(); const b = command('booking-b'); b.event.event_id = a.event.event_id;
    const results = await Promise.allSettled([f.store.commit('token', a), f.store.commit('token', b)]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
  });
  it('rejects canonical/event/body/ownership/actor mismatch without writes', async () => {
    const f = await fixture();
    const cases = [command(), command(), command(), command(), command(), command(), command()];
    cases[0].event.payload.version++; cases[1].event.subject.booking_id = 'other';
    cases[2].snapshot.tenantId = 'other'; cases[3].event.actor_id = 'other';
    cases[4].snapshot.policy.quote_id = 'other'; cases[5].event.after = { forged: true };
    cases[6].snapshot.policy.refund_bands[0].refund_pct = 101;
    for (const input of cases) await assert.rejects(f.store.commit('token', input), code('INVALID_RECORD', 'INVALID_REQUEST', 'AUTH_SCOPE_DENIED'));
    assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0, 0]);
  });
  for (const denial of ['account', 'membership', 'foreign', 'actor', 'producer'] as const) {
    it(`fails closed for ${denial} on write, replay and read`, async () => {
      const f = await fixture(); await f.store.commit('token', command());
      if (denial === 'account') f.account(false);
      if (denial === 'membership') f.membership(false);
      if (denial === 'foreign') f.foreign();
      if (denial === 'actor') f.actor('other-user');
      if (denial === 'producer') f.producer();
      await assert.rejects(f.store.commit('token', command()), code('AUTH_SCOPE_DENIED', 'INVALID_RECORD'));
      if (denial !== 'actor') await assert.rejects(f.store.read('token', 'booking-a'), code('AUTH_SCOPE_DENIED', 'INTEGRITY_FAILURE'));
      const newInput = command('booking-b');
      await assert.rejects(f.store.commit('token', newInput), code('AUTH_SCOPE_DENIED', 'INVALID_RECORD'));
      assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
    });
  }
  for (const suffix of ['records', 'revisions', 'audit', 'outbox', 'receipts', 'transaction_receipts']) {
    it(`rolls back every effect when ${suffix} insertion fails`, async () => {
      const f = await fixture();
      await client.db(database).command({ collMod: `${f.options.namespace}_${suffix}`, validator: { _id: { $exists: false } }, validationLevel: 'strict' });
      await assert.rejects(f.store.commit('token', command()), code('STORAGE_UNAVAILABLE'));
      assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0, 0]);
    });
  }
  for (const suffix of ['records', 'revisions', 'audit', 'receipts', 'transaction_receipts']) {
    it(`rejects ${suffix} tampering on read and replay`, async () => {
      const f = await fixture(); await f.store.commit('token', command());
      await f.collection(suffix).updateOne({}, { $set: suffix === 'receipts' ? { fingerprint: 'forged' } : suffix === 'records' || suffix === 'revisions' ? { payload: { ciphertext: '00' } } : { body: { ciphertext: '00' } } });
      await assert.rejects(f.store.read('token', 'booking-a'), code('INTEGRITY_FAILURE'));
      await assert.rejects(f.store.commit('token', command()), code('INTEGRITY_FAILURE'));
    });
  }
  it('denies missing permission grants/provenance and insufficient configured batch capacity', async () => {
    const f = await fixture();
    await assert.rejects(openPolicySnapshotStore({ ...f.options, configuration: { ...f.options.configuration, transaction: { ...f.options.configuration.transaction, maxRecords: 1 } } }), code('INVALID_REQUEST'));
    const disabled = await openPolicySnapshotStore({ ...f.options, loadPermissions: async () => ({ policyId: 'empty', revision: 1, grants: [] }) });
    await assert.rejects(disabled.commit('token', command()), code('AUTH_SCOPE_DENIED'));
    const unavailable = await openPolicySnapshotStore({ ...f.options, resolveBooking: async () => null });
    await assert.rejects(unavailable.commit('token', command()), code('AUTH_SCOPE_DENIED'));
    assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0, 0]);
  });
  it('maps trusted dependency failures to non-sensitive typed errors', async () => {
    const f = await fixture();
    const badClock = await openPolicySnapshotStore({ ...f.options, clock: () => { throw Error('PRIVATE-DEPENDENCY-DETAIL'); } });
    await assert.rejects(badClock.commit('token', command()), code('INVALID_REQUEST'));
    await assert.rejects(badClock.read('token', 'booking-a'), code('INVALID_REQUEST'));
    const badDirectory = await openPolicySnapshotStore({ ...f.options, resolveBooking: async () => { throw Error('PRIVATE-DEPENDENCY-DETAIL'); } });
    await assert.rejects(badDirectory.commit('token', command()), code('AUTH_SCOPE_DENIED'));
    assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0, 0]);
  });
});
