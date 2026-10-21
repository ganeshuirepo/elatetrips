import { strict as assert } from 'node:assert';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { mongo } from 'mongoose';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { z } from 'zod';
import { canonicalJson, createJsonProtection, type StorageKeys } from './encrypted-json';
import { resolvePrincipal, type VerifiedPrincipal } from './identity';
import { authenticateFoundationEvent, type StoredFoundationEvent } from './foundation-event';
import { openVersionedStore } from './persistence';
import { openOutboxWorker } from './outbox';
import { deliverySchema } from './outbox-record';
import { openSnapshotProjection } from './projection';
import {
  openDeliveryRecovery,
  DeliveryRecoveryError,
  type RecoveryOptions,
} from './delivery-recovery';

const now = '2026-10-21T12:00:00.000Z';
const payload = { note: 'Private synthetic recovery payload' };
const scope = { kind: 'organization' as const, id: 'fixture-org' };
const schema = z.object({ note: z.string() }).strict();
const failure = async () => {
  throw Error('Private provider exception');
};
function code(expected: string) {
  return (error: unknown) => error instanceof DeliveryRecoveryError && error.code === expected;
}
function gate() {
  let release: () => void = () => {
    throw Error('Gate not initialized');
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function principal(userId: string) {
  const result = await resolvePrincipal(
    'fixture',
    { sign: () => '', verify: () => ({ phone: 'fixture' }) },
    {
      findByTokenIdentifier: async () => ({ userId, active: true }),
    },
  );
  if (result.status !== 'authenticated') throw Error('Fixture identity failed');
  return result.principal;
}

describe('real Mongo scoped audited delivery recovery', () => {
  let replica: MongoMemoryReplSet;
  let client: mongo.MongoClient;
  const database = `recovery_test_${randomUUID().replace(/-/g, '')}`;
  before(async () => {
    replica = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    client = await new mongo.MongoClient(replica.getUri()).connect();
  });
  after(async () => {
    await client?.close();
    await replica?.stop();
  });

  async function fixture() {
    const namespace = `r_${randomUUID().replace(/-/g, '')}`;
    const keys: StorageKeys = {
      activeKeyId: 'fixture-key',
      encryptionKeys: new Map([['fixture-key', randomBytes(32)]]),
      fingerprintKey: randomBytes(32),
    };
    let instant = Date.parse(now);
    let active = true;
    let denied = '';
    let operatorScope: { kind: 'customer' | 'organization' | 'partner'; id: string } = scope;
    const user = await principal('source-user');
    const operator = await principal('ops-user');
    const common = {
      client,
      database,
      namespace,
      keys,
      clock: () => new Date(instant).toISOString(),
      memberships: {
        listForUser: async (userId: string) => [
          {
            membershipId: `member-${userId}`,
            userId,
            scope: userId === 'ops-user' ? operatorScope : scope,
            role: userId === 'ops-user' ? 'ops' : 'organizer',
            active: userId === 'ops-user' ? active : true,
            validFrom: null,
            expiresAt: null,
          },
        ],
      },
      loadPolicy: async () => ({
        policyId: 'fixture-permissions',
        revision: 1,
        grants: [
          { action: 'context.write', roles: ['organizer'] },
          { action: 'context.read', roles: ['organizer', 'ops'] },
          { action: 'delivery.read', roles: ['ops'] },
          { action: 'delivery.retry', roles: ['ops'] },
        ].filter((grant) => grant.action !== denied),
      }),
    };
    const store = await openVersionedStore({
      ...common,
      kind: 'fixture-record',
      schemaVersion: 'fixture-v1',
      schema,
      mode: 'mutable',
      readAction: 'context.read',
      writeAction: 'context.write',
    });
    const eventId = (
      await store.write(user, {
        id: 'fixture-record-a',
        commandId: 'fixture-create',
        correlationId: 'fixture-flow',
        createScope: scope,
        expectedRevision: 0,
        payload,
      })
    ).eventId;
    const workerOptions = {
      ...common,
      policy: {
        policyId: 'fixture-delivery',
        revision: 1,
        leaseDurationMs: 100,
        maxAttempts: 1,
        retryDelaysMs: [],
      },
    };
    const worker = await openOutboxWorker(workerOptions);
    const options: RecoveryOptions = {
      ...common,
      policy: {
        policyId: 'fixture-recovery',
        revision: 1,
        retryEnabled: true,
        maxRecoveriesPerEvent: 2,
        retryDelayMs: 10,
        reasonCodes: ['fixture_resolved', 'fixture_corrected'],
      },
    };
    const recovery = await openDeliveryRecovery(options);
    const collection = (suffix: string) => client.db(database).collection(`${namespace}_${suffix}`);
    const events = client.db(database).collection<StoredFoundationEvent>(`${namespace}_audit`);
    const row = async () => deliverySchema.parse(await collection('outbox').findOne({}));
    const request = async (commandId = 'fixture-retry', reasonCode = 'fixture_resolved') => ({
      commandId,
      eventId,
      expectedVersion: (await row()).version,
      reasonCode,
    });
    const dead = async () => {
      assert.equal((await worker.runOnce('fixture-worker', failure)).status, 'dead');
    };
    const audit = () => collection('delivery_audit').find().sort({ version: 1 }).toArray();
    const validator = async (suffix: string, value: Record<string, unknown>) =>
      client.db(database).command({
        collMod: `${namespace}_${suffix}`,
        validator: value,
        validationLevel: 'strict',
      });
    return {
      options,
      recovery,
      worker,
      workerOptions,
      common,
      eventId,
      user,
      operator,
      store,
      events,
      collection,
      row,
      request,
      dead,
      audit,
      validator,
      advance: (ms: number) => {
        instant += ms;
      },
      deny: (action: string) => {
        denied = action;
      },
      revoke: () => {
        active = false;
      },
      setScope: (value: typeof operatorScope) => {
        operatorScope = value;
      },
    };
  }

  it('returns scoped delivery metadata without payload, worker identity or lease token', async () => {
    const f = await fixture();
    await f.dead();
    const inspected = await f.recovery.inspect(f.operator, f.eventId);
    assert.ok(inspected);
    assert.equal(inspected.delivery.state, 'dead');
    assert.equal(inspected.delivery.attempts, 1);
    assert.equal(inspected.delivery.totalAttempts, 1);
    assert.equal(inspected.delivery.recoveryCount, 0);
    assert.equal(inspected.sourceRevision, 1);
    assert.equal(inspected.occurredAt, now);
    assert.equal(JSON.stringify(inspected).includes(payload.note), false);
    assert.equal('leaseToken' in inspected.delivery, false);
    assert.equal('workerId' in inspected.delivery, false);
    assert.equal('event' in inspected, false);
    assert.equal(await f.collection('recovery_receipts').countDocuments(), 0);
  });

  it('atomically requeues a dead entry with actor, reason, history and command receipt', async () => {
    const f = await fixture();
    await f.dead();
    const result = await f.recovery.retry(f.operator, await f.request());
    assert.deepEqual(result, {
      eventId: f.eventId,
      state: 'pending',
      version: 3,
      recoveryCount: 1,
      availableAt: '2026-10-21T12:00:00.010Z',
    });
    const row = await f.row();
    assert.equal(row.attempts, 0);
    assert.equal(row.totalAttempts, 1);
    assert.equal(row.lastError, 'DELIVERY_FAILED');
    const audit = await f.audit();
    assert.deepEqual(
      audit.map((entry) => entry.reason),
      ['claimed', 'attempts_exhausted', 'operator_retry'],
    );
    assert.equal(audit[2].actor, 'ops-user');
    assert.equal(audit[2].role, 'ops');
    assert.equal(audit[2].membershipId, 'member-ops-user');
    assert.equal(audit[2].reasonCode, 'fixture_resolved');
    assert.equal(audit[2].before.attempts, 1);
    assert.equal(audit[2].after.attempts, 0);
    assert.equal(audit[2].after.totalAttempts, 1);
    assert.equal(audit[2].after.recoveryCount, 1);
    assert.equal('leaseToken' in audit[2].before, false);
    assert.equal(JSON.stringify(audit).includes(payload.note), false);
    assert.equal(JSON.stringify(audit).includes('Private provider exception'), false);
    assert.equal(await f.collection('recovery_receipts').countDocuments(), 1);
    assert.equal(await f.collection('audit').countDocuments(), 1);
  });

  it('honors the configured availability delay and retains lifetime attempts after success', async () => {
    const f = await fixture();
    await f.dead();
    await f.recovery.retry(f.operator, await f.request());
    assert.equal(
      (await f.worker.runOnce('worker-b', async () => assert.fail('Not due'))).status,
      'idle',
    );
    f.advance(10);
    assert.equal((await f.worker.runOnce('worker-b', async () => {})).status, 'delivered');
    const row = await f.row();
    assert.equal(row.attempts, 1);
    assert.equal(row.totalAttempts, 2);
    assert.equal(row.recoveryCount, 1);
  });

  it('returns an exact prior recovery result after a worker has delivered it', async () => {
    const f = await fixture();
    await f.dead();
    const request = await f.request();
    const original = await f.recovery.retry(f.operator, request);
    f.advance(10);
    await f.worker.runOnce('worker-b', async () => {});
    assert.deepEqual(await f.recovery.retry(f.operator, request), original);
    assert.equal((await f.row()).state, 'delivered');
    assert.equal((await f.audit()).length, 5);
    assert.equal(await f.collection('recovery_receipts').countDocuments(), 1);
  });

  it('rejects changed intent under the same recovery command ID', async () => {
    const f = await fixture();
    await f.dead();
    const request = await f.request();
    await f.recovery.retry(f.operator, request);
    for (const changed of [
      { ...request, reasonCode: 'fixture_corrected' },
      { ...request, expectedVersion: request.expectedVersion + 1 },
    ])
      await assert.rejects(f.recovery.retry(f.operator, changed), code('IDEMPOTENCY_CONFLICT'));
    assert.equal((await f.row()).recoveryCount, 1);
    assert.equal((await f.audit()).length, 3);
  });

  it('coalesces concurrent identical requests into one recovery transition', async () => {
    const f = await fixture();
    await f.dead();
    const request = await f.request();
    const results = await Promise.all([
      f.recovery.retry(f.operator, request),
      f.recovery.retry(f.operator, request),
    ]);
    assert.deepEqual(results[0], results[1]);
    assert.equal((await f.audit()).length, 3);
    assert.equal((await f.row()).recoveryCount, 1);
  });

  it('allows only one concurrent command at the same expected queue version', async () => {
    const f = await fixture();
    await f.dead();
    const request = await f.request();
    const results = await Promise.allSettled([
      f.recovery.retry(f.operator, request),
      f.recovery.retry(f.operator, { ...request, commandId: 'competing-retry' }),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.ok(rejected?.status === 'rejected' && code('REVISION_CONFLICT')(rejected.reason));
    assert.equal((await f.audit()).length, 3);
    assert.equal(await f.collection('recovery_receipts').countDocuments(), 1);
  });

  it('rejects stale expected versions without resetting the delivery', async () => {
    const f = await fixture();
    await f.dead();
    await assert.rejects(
      f.recovery.retry(f.operator, { ...(await f.request()), expectedVersion: 1 }),
      code('REVISION_CONFLICT'),
    );
    assert.equal((await f.row()).state, 'dead');
    assert.equal((await f.audit()).length, 2);
  });

  for (const state of ['pending', 'delivered']) {
    it(`does not replay a ${state} delivery`, async () => {
      const f = await fixture();
      if (state === 'delivered') await f.worker.runOnce('worker-a', async () => {});
      await assert.rejects(
        f.recovery.retry(f.operator, await f.request()),
        code('DELIVERY_NOT_DEAD'),
      );
      assert.equal((await f.row()).state, state);
      assert.equal(await f.collection('recovery_receipts').countDocuments(), 0);
    });
  }

  it('refuses to steal either an active or expired leased entry', async () => {
    const f = await fixture();
    const entered = gate();
    const release = gate();
    const running = f.worker.runOnce('worker-a', async () => {
      entered.release();
      await release.promise;
    });
    await entered.promise;
    try {
      await assert.rejects(
        f.recovery.retry(f.operator, await f.request()),
        code('DELIVERY_NOT_DEAD'),
      );
      f.advance(100);
      await assert.rejects(
        f.recovery.retry(f.operator, await f.request()),
        code('DELIVERY_NOT_DEAD'),
      );
    } finally {
      release.release();
    }
    assert.equal((await running).status, 'lease_lost');
    assert.equal((await f.audit()).length, 1);
  });

  for (const fails of [false, true]) {
    it(`fences a stale worker ${fails ? 'failure' : 'acknowledgment'} across operator recovery`, async () => {
      const f = await fixture();
      const entered = gate();
      const release = gate();
      const original = f.worker.runOnce('worker-a', async () => {
        entered.release();
        await release.promise;
        if (fails) throw Error('Stale failure');
      });
      await entered.promise;
      f.advance(100);
      try {
        assert.equal(
          (await f.worker.runOnce('worker-b', async () => assert.fail('Final lease exhausted')))
            .status,
          'dead',
        );
        await f.recovery.retry(f.operator, await f.request());
        f.advance(10);
        assert.equal((await f.worker.runOnce('worker-b', async () => {})).status, 'delivered');
      } finally {
        release.release();
      }
      assert.equal((await original).status, 'lease_lost');
      assert.equal((await f.row()).state, 'delivered');
      assert.equal((await f.row()).version, 5);
      assert.equal((await f.row()).totalAttempts, 2);
      assert.equal((await f.audit()).length, 5);
    });
  }

  it('enforces disabled recovery and a zero configured recovery budget', async () => {
    const f = await fixture();
    await f.dead();
    const disabled = await openDeliveryRecovery({
      ...f.options,
      policy: { ...f.options.policy, retryEnabled: false },
    });
    await assert.rejects(disabled.retry(f.operator, await f.request()), code('RECOVERY_DISABLED'));
    const zero = await openDeliveryRecovery({
      ...f.options,
      policy: { ...f.options.policy, maxRecoveriesPerEvent: 0 },
    });
    await assert.rejects(zero.retry(f.operator, await f.request()), code('RECOVERY_LIMIT'));
    assert.equal((await f.row()).recoveryCount, 0);
  });

  it('caps repeated manual recoveries while preserving every lifetime attempt', async () => {
    const f = await fixture();
    await f.dead();
    for (let cycle = 1; cycle <= 2; cycle++) {
      await f.recovery.retry(f.operator, await f.request(`retry-${cycle}`));
      f.advance(10);
      await f.dead();
    }
    await assert.rejects(
      f.recovery.retry(f.operator, await f.request('retry-3')),
      code('RECOVERY_LIMIT'),
    );
    const row = await f.row();
    assert.equal(row.state, 'dead');
    assert.equal(row.recoveryCount, 2);
    assert.equal(row.totalAttempts, 3);
    assert.equal(await f.collection('recovery_receipts').countDocuments(), 2);
    assert.equal((await f.audit()).length, 8);
  });

  it('requires explicit action grants rather than the source creator role', async () => {
    const f = await fixture();
    await f.dead();
    await assert.rejects(f.recovery.inspect(f.user, f.eventId), code('AUTH_SCOPE_DENIED'));
    await assert.rejects(f.recovery.retry(f.user, await f.request()), code('AUTH_SCOPE_DENIED'));
    f.deny('delivery.retry');
    assert.ok(await f.recovery.inspect(f.operator, f.eventId));
    await assert.rejects(
      f.recovery.retry(f.operator, await f.request()),
      code('AUTH_SCOPE_DENIED'),
    );
    assert.equal((await f.audit()).length, 2);
  });

  for (const kind of ['customer', 'organization', 'partner'] as const) {
    it(`denies metadata and retry to an unrelated ${kind} membership`, async () => {
      const f = await fixture();
      await f.dead();
      f.setScope({ kind, id: 'other-scope' });
      await assert.rejects(f.recovery.inspect(f.operator, f.eventId), code('AUTH_SCOPE_DENIED'));
      await assert.rejects(
        f.recovery.retry(f.operator, await f.request()),
        code('AUTH_SCOPE_DENIED'),
      );
      assert.equal((await f.audit()).length, 2);
    });
  }

  it('rejects JSON principals and rechecks membership before exact command replay', async () => {
    const f = await fixture();
    await f.dead();
    const request = await f.request();
    const forged = JSON.parse(JSON.stringify(f.operator)) as VerifiedPrincipal;
    await assert.rejects(f.recovery.inspect(forged, f.eventId), code('AUTH_SCOPE_DENIED'));
    await assert.rejects(f.recovery.retry(forged, request), code('AUTH_SCOPE_DENIED'));
    await f.recovery.retry(f.operator, request);
    f.revoke();
    await assert.rejects(f.recovery.retry(f.operator, request), code('AUTH_SCOPE_DENIED'));
    assert.equal((await f.audit()).length, 3);
  });

  it('fails closed when permission storage is unavailable', async () => {
    const f = await fixture();
    await f.dead();
    const unavailable = await openDeliveryRecovery({
      ...f.options,
      loadPolicy: async () => {
        throw Error('Private permission failure');
      },
    });
    await assert.rejects(unavailable.inspect(f.operator, f.eventId), code('IDENTITY_UNAVAILABLE'));
    await assert.rejects(
      unavailable.retry(f.operator, await f.request()),
      code('IDENTITY_UNAVAILABLE'),
    );
    assert.equal((await f.audit()).length, 2);
  });

  for (const corruption of ['missing', 'ciphertext']) {
    it(`refuses to bypass a ${corruption} source event even for an operator`, async () => {
      const f = await fixture();
      await f.dead();
      if (corruption === 'missing') await f.events.deleteOne({ _id: f.eventId });
      else await f.events.updateOne({ _id: f.eventId }, { $set: { 'body.tag': '00'.repeat(16) } });
      await assert.rejects(f.recovery.inspect(f.operator, f.eventId), code('EVENT_INVALID'));
      await assert.rejects(f.recovery.retry(f.operator, await f.request()), code('EVENT_INVALID'));
      assert.equal((await f.audit()).length, 2);
      assert.equal((await f.row()).state, 'dead');
    });
  }

  it('can recover quarantine only after the original authentic source has been restored', async () => {
    const f = await fixture();
    const original = await f.events.findOne({ _id: f.eventId });
    assert.ok(original);
    await f.events.updateOne({ _id: f.eventId }, { $set: { 'body.tag': '00'.repeat(16) } });
    await f.dead();
    await assert.rejects(f.recovery.retry(f.operator, await f.request()), code('EVENT_INVALID'));
    // Test-only backup restoration. No recovery API edits or replaces source events.
    await f.events.replaceOne({ _id: f.eventId }, original);
    await f.recovery.retry(f.operator, await f.request());
    f.advance(10);
    assert.equal((await f.worker.runOnce('worker-b', async () => {})).status, 'delivered');
  });

  it('binds recovery replay to the original authenticated event intent', async () => {
    const f = await fixture();
    await f.dead();
    const request = await f.request();
    await f.recovery.retry(f.operator, request);
    const raw = await f.events.findOne({ _id: f.eventId });
    assert.ok(raw);
    const protection = createJsonProtection(f.options.keys);
    const event = authenticateFoundationEvent(raw, protection, {
      database,
      namespace: f.options.namespace,
      eventId: f.eventId,
    });
    const body = protection.seal(
      { ...event, after: { note: 'Changed source intent' } },
      canonicalJson({
        database,
        namespace: f.options.namespace,
        eventId: f.eventId,
        aggregate: raw.aggregateId,
        revision: raw.revision,
      }),
    );
    await f.events.updateOne({ _id: f.eventId }, { $set: { body } });
    await assert.rejects(f.recovery.retry(f.operator, request), code('IDEMPOTENCY_CONFLICT'));
    assert.equal((await f.audit()).length, 3);
  });

  for (const suffix of ['outbox', 'delivery_audit', 'recovery_receipts']) {
    it(`rolls back queue, audit and command receipt when ${suffix} rejects recovery`, async () => {
      const f = await fixture();
      await f.dead();
      const validation =
        suffix === 'outbox'
          ? { state: 'dead' }
          : suffix === 'delivery_audit'
            ? { reason: { $ne: 'operator_retry' } }
            : { forcedFailure: { $exists: true } };
      await f.validator(suffix, validation);
      await assert.rejects(
        f.recovery.retry(f.operator, await f.request()),
        code('STORAGE_UNAVAILABLE'),
      );
      assert.equal((await f.row()).state, 'dead');
      assert.equal((await f.row()).version, 2);
      assert.equal((await f.row()).recoveryCount, 0);
      assert.equal((await f.audit()).length, 2);
      assert.equal(await f.collection('recovery_receipts').countDocuments(), 0);
    });
  }

  it('does not duplicate projection effects when recovered delivery is processed again', async () => {
    const f = await fixture();
    const projection = await openSnapshotProjection({
      ...f.common,
      kind: 'fixture-record',
      schemaVersion: 'fixture-v1',
      schema,
      projectionId: 'fixture-view',
      readAction: 'context.read',
    });
    assert.equal(
      (
        await f.worker.runOnce('worker-a', async (message) => {
          await projection.handle(message);
          throw Error('Lost acknowledgment after consumer commit');
        })
      ).status,
      'dead',
    );
    await f.recovery.retry(f.operator, await f.request());
    f.advance(10);
    assert.equal((await f.worker.runOnce('worker-b', projection.handle)).status, 'delivered');
    assert.deepEqual((await projection.read(f.operator, 'fixture-record-a'))?.payload, payload);
    assert.equal(await f.collection('projection_audit').countDocuments(), 1);
    assert.equal(await f.collection('projection_receipts').countDocuments(), 1);
    assert.equal((await f.row()).totalAttempts, 2);
  });

  it('retains exact recovery receipts after a new client opens the recovery port', async () => {
    const f = await fixture();
    await f.dead();
    const request = await f.request();
    const original = await f.recovery.retry(f.operator, request);
    const connection = await new mongo.MongoClient(replica.getUri()).connect();
    try {
      const reopened = await openDeliveryRecovery({ ...f.options, client: connection });
      assert.deepEqual(await reopened.retry(f.operator, request), original);
    } finally {
      await connection.close();
    }
    assert.equal((await f.audit()).length, 3);
  });

  it('rejects altered recovery receipts and unknown queue formats', async () => {
    const f = await fixture();
    await f.dead();
    const request = await f.request();
    await f.recovery.retry(f.operator, request);
    await f
      .collection('recovery_receipts')
      .updateOne({}, { $set: { 'body.tag': '00'.repeat(16) } });
    await assert.rejects(f.recovery.retry(f.operator, request), code('INTEGRITY_FAILURE'));
    await f.collection('outbox').updateOne({}, { $set: { format: 1 } });
    await assert.rejects(f.recovery.inspect(f.operator, f.eventId), code('INTEGRITY_FAILURE'));
  });

  it('rejects impossible cycle/lifetime counters instead of granting another recovery', async () => {
    for (const fields of [{ attempts: 0 }, { recoveryCount: 2 }, { totalAttempts: 99 }]) {
      const f = await fixture();
      await f.dead();
      const request = await f.request();
      await f.collection('outbox').updateOne({}, { $set: fields });
      await assert.rejects(f.recovery.inspect(f.operator, f.eventId), code('INTEGRITY_FAILURE'));
      await assert.rejects(f.recovery.retry(f.operator, request), code('INTEGRITY_FAILURE'));
      assert.equal((await f.audit()).length, 2);
    }
  });

  it('rejects unconfigured reasons and request fields that try to set scope or counters', async () => {
    const f = await fixture();
    await f.dead();
    const request = await f.request();
    for (const altered of [
      { ...request, reasonCode: 'not_configured' },
      { ...request, scope },
      { ...request, attempts: 0 },
      { ...request, recoveryCount: 0 },
      { ...request, payload },
    ])
      await assert.rejects(f.recovery.retry(f.operator, altered), code('INVALID_REQUEST'));
    assert.equal((await f.audit()).length, 2);
  });

  it('validates policy, clock, delay overflow and missing event behavior', async () => {
    const f = await fixture();
    await f.dead();
    assert.equal(await f.recovery.inspect(f.operator, 'missing'), null);
    await assert.rejects(
      f.recovery.retry(f.operator, { ...(await f.request()), eventId: 'missing' }),
      code('NOT_FOUND'),
    );
    const invalid = await openDeliveryRecovery({ ...f.options, clock: () => 'invalid' });
    await assert.rejects(invalid.inspect(f.operator, f.eventId), code('INVALID_REQUEST'));
    const overflow = await openDeliveryRecovery({
      ...f.options,
      policy: { ...f.options.policy, retryDelayMs: Number.MAX_SAFE_INTEGER - 1 },
    });
    await assert.rejects(
      overflow.retry(f.operator, await f.request()),
      code('INVALID_CONFIGURATION'),
    );
    for (const policy of [
      { ...f.options.policy, revision: 0 },
      { ...f.options.policy, retryDelayMs: -1 },
      { ...f.options.policy, reasonCodes: ['duplicate', 'duplicate'] },
    ])
      await assert.rejects(
        openDeliveryRecovery({ ...f.options, policy }),
        code('INVALID_CONFIGURATION'),
      );
    assert.equal((await f.audit()).length, 2);
  });

  it('protects command IDs with a unique policy/command index', async () => {
    const f = await fixture();
    await f.dead();
    await f.recovery.retry(f.operator, await f.request());
    const receipt = await f.collection('recovery_receipts').findOne({});
    assert.ok(receipt);
    await assert.rejects(
      f.collection('recovery_receipts').insertOne({ ...receipt, _id: new mongo.ObjectId() }),
      (error: unknown) => error instanceof mongo.MongoServerError && error.code === 11000,
    );
  });

  it('reports closed storage through fixed error codes', async () => {
    const f = await fixture();
    await f.dead();
    const connection = await new mongo.MongoClient(replica.getUri()).connect();
    const recovery = await openDeliveryRecovery({ ...f.options, client: connection });
    await connection.close();
    await assert.rejects(recovery.inspect(f.operator, f.eventId), code('STORAGE_UNAVAILABLE'));
    await assert.rejects(
      recovery.retry(f.operator, await f.request()),
      code('STORAGE_UNAVAILABLE'),
    );
  });

  it('rejects standalone Mongo before creating recovery storage', async () => {
    const f = await fixture();
    const standalone = await MongoMemoryServer.create();
    const connection = await new mongo.MongoClient(standalone.getUri()).connect();
    try {
      await assert.rejects(
        openDeliveryRecovery({ ...f.options, client: connection }),
        code('TRANSACTIONS_REQUIRED'),
      );
      assert.equal((await connection.db(database).listCollections().toArray()).length, 0);
    } finally {
      await connection.close();
      await standalone.stop();
    }
  });
});
