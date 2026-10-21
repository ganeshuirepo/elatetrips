import { AssertionError, strict as assert } from 'node:assert';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { mongo } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { z } from 'zod';
import { resolvePrincipal } from './identity';
import { openVersionedStore } from './persistence';
import { deliverySchema } from './outbox-record';
import {
  openOutboxWorker,
  OutboxError,
  type DeliveryControl,
  type DeliveryHandler,
  type LeaseRenewalPolicy,
  type OutboxOptions,
} from './outbox';
import { createOutboxRunner } from './outbox-runner';

const time = '2026-10-21T12:00:00.000Z';
const renewalPolicy = (): LeaseRenewalPolicy => ({
  policyId: 'fixture-renewal',
  revision: 1,
  maxExtensions: 3,
  maxLifetimeMs: 350,
});
function code(expected: string) {
  return (error: unknown) => error instanceof OutboxError && error.code === expected;
}
function required(control: DeliveryControl | undefined) {
  if (!control) throw Error('Missing fixture control');
  return control;
}

describe('real Mongo bounded audited lease renewal', () => {
  let replica: MongoMemoryReplSet;
  let client: mongo.MongoClient;
  const database = `renewal_test_${randomUUID().replace(/-/g, '')}`;
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
  async function fixture(
    renewal: LeaseRenewalPolicy | undefined = renewalPolicy(),
    disabled = false,
  ) {
    const namespace = `l_${randomUUID().replace(/-/g, '')}`;
    const keys = {
      activeKeyId: 'fixture-key',
      encryptionKeys: new Map([['fixture-key', randomBytes(32)]]),
      fingerprintKey: randomBytes(32),
    };
    let instant = Date.parse(time);
    let clockOverride: string | undefined;
    const scope = { kind: 'customer' as const, id: 'fixture-user' };
    const identity = await resolvePrincipal(
      'fixture',
      { sign: () => '', verify: () => ({ phone: 'fixture' }) },
      { findByTokenIdentifier: async () => ({ userId: scope.id, active: true }) },
    );
    if (identity.status !== 'authenticated') throw Error('Fixture identity');
    const options: OutboxOptions = {
      client,
      database,
      namespace,
      keys,
      clock: () => clockOverride ?? new Date(instant).toISOString(),
      policy: {
        policyId: 'fixture-delivery',
        revision: 1,
        leaseDurationMs: 100,
        maxAttempts: 3,
        retryDelaysMs: [10, 20],
      },
      ...(!disabled && renewal ? { renewal } : {}),
    };
    const store = await openVersionedStore({
      ...options,
      kind: 'fixture-record',
      schemaVersion: 'fixture-v1',
      schema: z.object({ note: z.string() }).strict(),
      mode: 'mutable',
      readAction: 'context.read',
      writeAction: 'context.write',
      loadPolicy: async () => ({
        policyId: 'fixture-access',
        revision: 1,
        grants: [{ action: 'context.write', roles: ['customer'] }],
      }),
      memberships: {
        listForUser: async (userId) => [
          {
            membershipId: 'fixture-member',
            userId,
            scope,
            role: 'customer',
            active: true,
            validFrom: null,
            expiresAt: null,
          },
        ],
      },
    });
    const eventId = (
      await store.write(identity.principal, {
        id: 'record-a',
        commandId: 'command-a',
        correlationId: 'flow',
        expectedRevision: 0,
        createScope: scope,
        payload: { note: 'Private fixture content' },
      })
    ).eventId;
    const rawWorker = await openOutboxWorker(options);
    // Consumer failures are intentionally handled by the worker. Fixture assertions
    // must still fail the test instead of being mistaken for expected delivery errors.
    const worker = {
      async runOnce(workerId: string, handler: DeliveryHandler) {
        let assertion: AssertionError | undefined;
        try {
          return await rawWorker.runOnce(workerId, async (message, control) => {
            try {
              await handler(message, control);
            } catch (error) {
              if (error instanceof AssertionError) assertion = error;
              throw error;
            }
          });
        } finally {
          if (assertion) throw assertion;
        }
      },
    };
    const collection = (suffix: string) => client.db(database).collection(`${namespace}_${suffix}`);
    const row = async () => deliverySchema.parse(await collection('outbox').findOne({ eventId }));
    const journal = () => collection('delivery_audit').find().sort({ version: 1 }).toArray();
    const validator = (suffix: string, value: Record<string, unknown>) =>
      client.db(database).command({
        collMod: `${namespace}_${suffix}`,
        validator: value,
        validationLevel: 'strict',
      });
    return {
      worker,
      options,
      eventId,
      collection,
      row,
      journal,
      validator,
      advance: (ms: number) => {
        instant += ms;
      },
      setClock: (value: string | undefined) => {
        clockOverride = value;
      },
    };
  }

  it('leaves renewal disabled without explicit configuration', async () => {
    const f = await fixture(undefined, true);
    assert.equal(
      (
        await f.worker.runOnce('worker', async (_, control) => {
          assert.deepEqual(await required(control).renewLease(), { status: 'disabled' });
        })
      ).status,
      'delivered',
    );
    assert.equal((await f.journal()).length, 2);
  });
  it('extends a live lease and blocks another worker past the original expiry', async () => {
    const f = await fixture();
    const result = await f.worker.runOnce('worker', async (_, control) => {
      f.advance(80);
      assert.deepEqual(await required(control).renewLease(), {
        status: 'renewed',
        leaseUntil: '2026-10-21T12:00:00.180Z',
      });
      f.advance(30);
      assert.deepEqual(
        await f.worker.runOnce('other-worker', async () => assert.fail('Renewed lease')),
        { status: 'idle' },
      );
    });
    assert.equal(result.status, 'delivered');
    const row = await f.row();
    assert.equal(row.version, 3);
    assert.equal(row.attempts, 1);
    assert.equal(row.totalAttempts, 1);
    assert.equal(row.recoveryCount, 0);
  });
  it('journals renewal identity/configuration and before-after atomically without tokens or content', async () => {
    const f = await fixture();
    let token: string | null = null;
    await f.worker.runOnce('worker', async (_, control) => {
      token = (await f.row()).leaseToken;
      f.advance(80);
      await required(control).renewLease();
    });
    const journal = await f.journal();
    assert.deepEqual(
      journal.map((row) => row.reason),
      ['claimed', 'lease_renewed', 'delivered'],
    );
    const entry = journal[1];
    assert.equal(entry.actor, 'worker');
    assert.equal(entry.role, 'worker');
    assert.equal(entry.policyId, 'fixture-delivery');
    assert.equal(entry.renewalPolicyId, 'fixture-renewal');
    assert.equal(entry.renewalPolicyRevision, 1);
    assert.equal(entry.before.version, 1);
    assert.equal(entry.after.version, 2);
    assert.equal(entry.ts.toISOString(), '2026-10-21T12:00:00.080Z');
    const serialized = JSON.stringify(journal);
    assert.ok(token);
    assert.equal(serialized.includes(token), false);
    assert.equal(serialized.includes('Private'), false);
    assert.equal('leaseToken' in entry.after, false);
  });
  it('a too-early renewal is a no-op and consumes no extension budget', async () => {
    const f = await fixture({ ...renewalPolicy(), maxExtensions: 1 });
    await f.worker.runOnce('worker', async (_, control) => {
      const c = required(control);
      assert.deepEqual(await c.renewLease(), { status: 'unchanged' });
      f.advance(50);
      assert.equal((await c.renewLease()).status, 'renewed');
      f.advance(10);
      assert.deepEqual(await c.renewLease(), { status: 'limit_reached' });
    });
    assert.equal((await f.journal()).filter((row) => row.reason === 'lease_renewed').length, 1);
  });
  it('caps lease lifetime from the original claim, including a clipped final extension', async () => {
    const f = await fixture({ ...renewalPolicy(), maxLifetimeMs: 250 });
    await f.worker.runOnce('worker', async (_, control) => {
      const c = required(control);
      f.advance(80);
      await c.renewLease();
      f.advance(80);
      assert.deepEqual(await c.renewLease(), {
        status: 'renewed',
        leaseUntil: '2026-10-21T12:00:00.250Z',
      });
      f.advance(80);
      assert.deepEqual(await c.renewLease(), { status: 'limit_reached' });
    });
    assert.equal((await f.row()).state, 'delivered');
  });
  it('zero extension budget makes no renewal write', async () => {
    const f = await fixture({ ...renewalPolicy(), maxExtensions: 0 });
    await f.worker.runOnce('worker', async (_, control) => {
      f.advance(50);
      assert.deepEqual(await required(control).renewLease(), { status: 'limit_reached' });
    });
    assert.equal((await f.row()).version, 2);
  });
  it('serializes concurrent renewal requests with one commit at the same time', async () => {
    const f = await fixture();
    await f.worker.runOnce('worker', async (_, control) => {
      f.advance(80);
      const c = required(control);
      const results = await Promise.all([c.renewLease(), c.renewLease(), c.renewLease()]);
      assert.deepEqual(
        results.map((result) => result.status),
        ['renewed', 'unchanged', 'unchanged'],
      );
    });
    assert.equal((await f.journal()).length, 3);
  });
  it('drains an accepted unawaited renewal before the durable acknowledgment', async () => {
    const f = await fixture();
    await f.worker.runOnce('worker', async (_, control) => {
      f.advance(80);
      void required(control).renewLease();
    });
    assert.deepEqual(
      (await f.journal()).map((entry) => entry.reason),
      ['claimed', 'lease_renewed', 'delivered'],
    );
    assert.equal((await f.row()).version, 3);
  });
  it('closes retained capabilities after successful and failed consumers', async () => {
    for (const failed of [false, true]) {
      const f = await fixture();
      let renew: DeliveryControl['renewLease'] = async () => assert.fail('Missing control');
      await f.worker.runOnce('worker', async (_, control) => {
        renew = required(control).renewLease;
        if (failed) throw Error('Private failure');
      });
      const before = await f.row();
      assert.deepEqual(await renew(), { status: 'closed' });
      assert.deepEqual(await f.row(), before);
    }
  });
  it('rejects exact-expiry renewal and never resurrects a lost lease after clock reversal', async () => {
    const f = await fixture();
    const result = await f.worker.runOnce('worker', async (_, control) => {
      f.advance(100);
      const c = required(control);
      assert.deepEqual(await c.renewLease(), { status: 'lease_lost' });
      f.advance(-50);
      assert.deepEqual(await c.renewLease(), { status: 'lease_lost' });
    });
    assert.equal(result.status, 'lease_lost');
    assert.equal((await f.journal()).length, 1);
  });
  it('fences the old renewal capability after a replacement reuses the worker name', async () => {
    const f = await fixture();
    const result = await f.worker.runOnce('same-worker', async (_, control) => {
      f.advance(100);
      assert.equal((await f.worker.runOnce('same-worker', async () => {})).status, 'delivered');
      assert.deepEqual(await required(control).renewLease(), { status: 'lease_lost' });
    });
    assert.equal(result.status, 'lease_lost');
    assert.equal((await f.row()).attempts, 2);
    assert.equal(
      (await f.journal()).some((entry) => entry.reason === 'lease_renewed'),
      false,
    );
  });
  it('a reopened worker respects the extended lease and recovers it after expiry', async () => {
    const f = await fixture();
    const other = await openOutboxWorker(f.options);
    const result = await f.worker.runOnce('worker', async (_, control) => {
      f.advance(80);
      await required(control).renewLease();
      f.advance(30);
      assert.equal(
        (await other.runOnce('other', async () => assert.fail('Still leased'))).status,
        'idle',
      );
      f.advance(70);
      assert.equal((await other.runOnce('other', async () => {})).status, 'delivered');
    });
    assert.equal(result.status, 'lease_lost');
    assert.equal((await f.row()).totalAttempts, 2);
  });
  it('a failed consumer after renewal uses the latest fenced version to schedule retry', async () => {
    const f = await fixture();
    const result = await f.worker.runOnce('worker', async (_, control) => {
      f.advance(80);
      await required(control).renewLease();
      throw Error('Private failure');
    });
    assert.equal(result.status, 'retry_scheduled');
    assert.equal((await f.row()).version, 3);
    assert.equal((await f.row()).lastError, 'DELIVERY_FAILED');
  });
  for (const rejected of ['delivery_audit', 'outbox']) {
    it(`rolls back renewal when ${rejected} rejects its write and prevents acknowledgment`, async () => {
      const f = await fixture();
      await assert.rejects(
        f.worker.runOnce('worker', async (_, control) => {
          f.advance(80);
          await f.validator(rejected, { forbiddenFixture: { $exists: true } });
          await assert.rejects(required(control).renewLease(), code('STORAGE_UNAVAILABLE'));
        }),
        code('STORAGE_UNAVAILABLE'),
      );
      const row = await f.row();
      assert.equal(row.state, 'leased');
      assert.equal(row.version, 1);
      assert.equal(row.leaseUntil?.toISOString(), '2026-10-21T12:00:00.100Z');
      assert.equal((await f.journal()).length, 1);
    });
  }
  it('observes an unawaited renewal storage failure without acknowledging the event', async () => {
    const f = await fixture();
    await assert.rejects(
      f.worker.runOnce('worker', async (_, control) => {
        f.advance(80);
        await f.validator('delivery_audit', { forbiddenFixture: { $exists: true } });
        void required(control).renewLease();
      }),
      code('STORAGE_UNAVAILABLE'),
    );
    assert.equal((await f.row()).version, 1);
    assert.equal((await f.row()).state, 'leased');
  });
  it('fails closed on invalid or backward clock values without a renewal write', async () => {
    for (const invalid of ['invalid', '2026-10-21T11:59:59.000Z']) {
      const f = await fixture();
      await assert.rejects(
        f.worker.runOnce('worker', async (_, control) => {
          f.setClock(invalid);
          await required(control).renewLease();
        }),
        code('INVALID_REQUEST'),
      );
      assert.equal((await f.row()).version, 1);
    }
  });
  it('rejects lifetime timestamp overflow and corrupt queue state before renewal', async () => {
    const overflow = await fixture({
      ...renewalPolicy(),
      maxLifetimeMs: Number.MAX_SAFE_INTEGER - 1,
    });
    await assert.rejects(
      overflow.worker.runOnce('worker', async (_, control) => {
        overflow.advance(50);
        await required(control).renewLease();
      }),
      code('INVALID_CONFIGURATION'),
    );
    const f = await fixture();
    await assert.rejects(
      f.worker.runOnce('worker', async (_, control) => {
        await f
          .collection('outbox')
          .updateOne({ eventId: f.eventId }, { $set: { totalAttempts: 0 } });
        await required(control).renewLease();
      }),
      code('INTEGRITY_FAILURE'),
    );
    assert.equal((await f.journal()).length, 1);
  });
  it('validates renewal policy and detaches it from caller mutation', async () => {
    const configured = renewalPolicy();
    const f = await fixture(configured);
    const invalid = [
      { ...configured, maxLifetimeMs: 99 },
      { ...configured, maxExtensions: -1 },
      { ...configured, maxExtensions: Infinity },
      { ...configured, revision: 0 },
      { ...configured, unknown: true },
      null,
    ];
    for (const value of invalid)
      await assert.rejects(
        openOutboxWorker({ ...f.options, renewal: JSON.parse(JSON.stringify(value)) }),
        code('INVALID_CONFIGURATION'),
      );
    configured.maxExtensions = 0;
    configured.maxLifetimeMs = 100;
    await f.worker.runOnce('worker', async (_, control) => {
      f.advance(50);
      assert.equal((await required(control).renewLease()).status, 'renewed');
    });
  });
  it('forwards the process-local renewal control through runner routes', async () => {
    const f = await fixture();
    const controller = new AbortController();
    const runner = createOutboxRunner({
      worker: f.worker,
      workerId: 'runner-worker',
      policy: {
        policyId: 'fixture-runner',
        revision: 1,
        enabled: true,
        idleDelayMs: 10,
        workDelayMs: 0,
        storageRetryDelaysMs: [],
      },
      routes: [
        {
          kind: 'fixture-record',
          schemaVersion: 'fixture-v1',
          handle: async (_, signal, control) => {
            assert.equal(signal, controller.signal);
            f.advance(80);
            await required(control).renewLease();
            f.advance(30);
            controller.abort();
          },
        },
      ],
      wait: async () => assert.fail('Already stopped'),
    });
    const report = await runner.run(controller.signal);
    assert.equal(report.counts.delivered, 1);
    assert.equal((await f.row()).version, 3);
  });
});
