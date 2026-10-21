import { strict as assert } from 'node:assert';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { mongo } from 'mongoose';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { z } from 'zod';
import { resolvePrincipal } from './identity';
import { canonicalJson, createJsonProtection, type StorageKeys } from './encrypted-json';
import { openVersionedStore } from './persistence';
import { deliverySchema } from './outbox-record';
import {
  openOutboxWorker,
  OutboxError,
  type DeliveryPolicy,
  type OutboxMessage,
  type OutboxOptions,
} from './outbox';

const sourceTime = '2026-10-21T12:00:00.000Z';
const payload = { note: 'Private synthetic content' };
const fixturePolicy = (): DeliveryPolicy => ({
  policyId: 'fixture-delivery',
  revision: 1,
  leaseDurationMs: 100,
  maxAttempts: 3,
  retryDelaysMs: [10, 50],
});
function code(expected: string) {
  return (error: unknown) => error instanceof OutboxError && error.code === expected;
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

describe('real Mongo recoverable audited outbox delivery', () => {
  let replica: MongoMemoryReplSet;
  let client: mongo.MongoClient;
  const database = `outbox_test_${randomUUID().replace(/-/g, '')}`;
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

  async function fixture(policy = fixturePolicy(), seed = true) {
    const namespace = `q_${randomUUID().replace(/-/g, '')}`;
    const keys: StorageKeys = {
      activeKeyId: 'fixture-key',
      encryptionKeys: new Map([['fixture-key', randomBytes(32)]]),
      fingerprintKey: randomBytes(32),
    };
    let instant = Date.parse(sourceTime);
    const scope = { kind: 'customer' as const, id: 'fixture-user' };
    const identity = await resolvePrincipal(
      'fixture',
      { sign: () => '', verify: () => ({ phone: 'fixture' }) },
      {
        findByTokenIdentifier: async () => ({ userId: scope.id, active: true }),
      },
    );
    if (identity.status !== 'authenticated') throw Error('Fixture identity failed');
    const store = await openVersionedStore({
      client,
      database,
      namespace,
      kind: 'fixture-record',
      schemaVersion: 'fixture-v1',
      schema: z.object({ note: z.string() }).strict(),
      mode: 'mutable',
      readAction: 'context.read',
      writeAction: 'context.write',
      keys,
      clock: () => sourceTime,
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
    let eventId = '';
    if (seed)
      eventId = (
        await store.write(identity.principal, {
          id: 'record-a',
          commandId: 'command-a',
          correlationId: 'flow-a',
          createScope: scope,
          expectedRevision: 0,
          payload,
        })
      ).eventId;
    const options: OutboxOptions = {
      client,
      database,
      namespace,
      keys,
      policy,
      clock: () => new Date(instant).toISOString(),
    };
    const worker = await openOutboxWorker(options);
    const collection = (suffix: string) => client.db(database).collection(`${namespace}_${suffix}`);
    const row = async () => deliverySchema.parse(await collection('outbox').findOne({}));
    const journal = () => collection('delivery_audit').find().sort({ version: 1 }).toArray();
    const journalValidator = async (validator: Record<string, unknown>) =>
      client.db(database).command({
        collMod: `${namespace}_delivery_audit`,
        validator,
        validationLevel: 'strict',
      });
    return {
      worker,
      options,
      eventId,
      collection,
      row,
      journal,
      journalValidator,
      advance: (ms: number) => {
        instant += ms;
      },
    };
  }

  it('is idle without queued records and calls no handler', async () => {
    const f = await fixture(fixturePolicy(), false);
    assert.deepEqual(
      await f.worker.runOnce('worker-a', async () => assert.fail('Must stay idle')),
      { status: 'idle' },
    );
    assert.equal((await f.journal()).length, 0);
  });

  it('delivers an authenticated event and retains distinct source/receive times', async () => {
    const f = await fixture();
    f.advance(20);
    const received: OutboxMessage[] = [];
    assert.deepEqual(
      await f.worker.runOnce('worker-a', async (message) => {
        received.push(message);
        assert.equal((await f.row()).state, 'leased');
        assert.equal('leaseToken' in message, false);
      }),
      { status: 'delivered', eventId: f.eventId },
    );
    assert.equal(received.length, 1);
    assert.equal(received[0].eventId, f.eventId);
    assert.equal(received[0].occurredAt, sourceTime);
    assert.equal(received[0].receivedAt, '2026-10-21T12:00:00.020Z');
    assert.deepEqual(received[0].event.after, payload);
    const row = await f.row();
    assert.equal(row.state, 'delivered');
    assert.equal(row.attempts, 1);
    assert.equal(row.version, 2);
    assert.equal(row.leaseToken, null);
    assert.equal(row.workerId, null);
    assert.equal(row.deliveredAt?.toISOString(), received[0].receivedAt);
    const journal = await f.journal();
    assert.deepEqual(
      journal.map((entry) => entry.reason),
      ['claimed', 'delivered'],
    );
    assert.deepEqual(
      journal.map((entry) => entry.version),
      [1, 2],
    );
    assert.equal(journal[0].actor, 'worker-a');
    assert.equal(journal[0].role, 'worker');
    assert.equal(journal[0].policyId, 'fixture-delivery');
    assert.equal(journal[0].policyRevision, 1);
    assert.equal(journal[0].before.state, 'pending');
    assert.equal(journal[1].after.state, 'delivered');
    assert.equal(JSON.stringify(journal).includes(payload.note), false);
    assert.equal('leaseToken' in journal[0].before, false);
    assert.equal('leaseToken' in journal[0].after, false);
    assert.deepEqual(
      await f.worker.runOnce('worker-b', async () => assert.fail('Already delivered')),
      { status: 'idle' },
    );
  });

  it('allows only one active worker to claim the same entry', async () => {
    const f = await fixture();
    const entered = gate();
    const release = gate();
    const first = f.worker.runOnce('worker-a', async () => {
      entered.release();
      await release.promise;
    });
    await entered.promise;
    try {
      const second = await openOutboxWorker(f.options);
      assert.deepEqual(
        await second.runOnce('worker-b', async () => assert.fail('Lease is active')),
        { status: 'idle' },
      );
      assert.equal((await f.row()).attempts, 1);
    } finally {
      release.release();
    }
    assert.equal((await first).status, 'delivered');
    assert.equal((await f.journal()).length, 2);
  });

  it('resolves simultaneous claim races without duplicate active delivery', async () => {
    const f = await fixture();
    let calls = 0;
    const results = await Promise.all(
      ['worker-a', 'worker-b'].map((worker) =>
        f.worker.runOnce(worker, async () => {
          calls++;
        }),
      ),
    );
    assert.equal(calls, 1);
    assert.deepEqual(results.map((result) => result.status).sort(), ['delivered', 'idle']);
    assert.equal((await f.row()).attempts, 1);
  });

  it('uses configured retry delays and clears failure state after successful delivery', async () => {
    const f = await fixture();
    let calls = 0;
    const handler = async () => {
      if (++calls < 3) throw Error('Private provider response');
    };
    assert.equal((await f.worker.runOnce('worker-a', handler)).status, 'retry_scheduled');
    assert.equal((await f.row()).availableAt.toISOString(), '2026-10-21T12:00:00.010Z');
    f.advance(9);
    assert.equal((await f.worker.runOnce('worker-a', handler)).status, 'idle');
    f.advance(1);
    assert.equal((await f.worker.runOnce('worker-a', handler)).status, 'retry_scheduled');
    assert.equal((await f.row()).availableAt.toISOString(), '2026-10-21T12:00:00.060Z');
    f.advance(49);
    assert.equal((await f.worker.runOnce('worker-a', handler)).status, 'idle');
    f.advance(1);
    assert.equal((await f.worker.runOnce('worker-a', handler)).status, 'delivered');
    assert.equal(calls, 3);
    const row = await f.row();
    assert.equal(row.attempts, 3);
    assert.equal(row.lastError, null);
    assert.equal((await f.journal()).length, 6);
    assert.equal(JSON.stringify(await f.journal()).includes('Private provider response'), false);
  });

  it('marks exhausted attempts dead without a further handler call', async () => {
    const f = await fixture({ ...fixturePolicy(), maxAttempts: 2, retryDelaysMs: [0] });
    let calls = 0;
    const handler = async () => {
      calls++;
      throw Error('Sensitive failure details');
    };
    assert.equal((await f.worker.runOnce('worker-a', handler)).status, 'retry_scheduled');
    assert.equal((await f.worker.runOnce('worker-a', handler)).status, 'dead');
    assert.equal((await f.worker.runOnce('worker-a', handler)).status, 'idle');
    assert.equal(calls, 2);
    assert.equal((await f.row()).lastError, 'DELIVERY_FAILED');
    assert.equal((await f.row()).state, 'dead');
    const journal = await f.journal();
    assert.equal(journal[journal.length - 1].reason, 'attempts_exhausted');
    assert.equal(JSON.stringify(journal).includes('Sensitive failure details'), false);
  });

  it('retains the actual failure reason when a newer policy reduces the attempt limit', async () => {
    const f = await fixture();
    await f.worker.runOnce('worker-a', async () => {
      throw Error('Fixture failure');
    });
    f.advance(10);
    const worker = await openOutboxWorker({
      ...f.options,
      policy: {
        ...fixturePolicy(),
        revision: 2,
        maxAttempts: 1,
        retryDelaysMs: [],
      },
    });
    assert.equal(
      (await worker.runOnce('worker-b', async () => assert.fail('New limit reached'))).status,
      'dead',
    );
    assert.equal((await f.row()).lastError, 'DELIVERY_FAILED');
    const journal = await f.journal();
    assert.equal(journal[journal.length - 1].policyRevision, 2);
  });

  for (const fails of [false, true]) {
    it(`fences a stale worker ${fails ? 'failure' : 'acknowledgment'} after lease recovery`, async () => {
      const f = await fixture();
      const entered = gate();
      const release = gate();
      const first = f.worker.runOnce('reused-worker-id', async () => {
        entered.release();
        await release.promise;
        if (fails) throw Error('Stale worker failed');
      });
      await entered.promise;
      const firstToken = (await f.row()).leaseToken;
      f.advance(100);
      const second = await openOutboxWorker(f.options);
      try {
        assert.equal(
          (
            await second.runOnce('reused-worker-id', async () => {
              assert.notEqual((await f.row()).leaseToken, firstToken);
            })
          ).status,
          'delivered',
        );
      } finally {
        release.release();
      }
      assert.equal((await first).status, 'lease_lost');
      assert.equal((await f.row()).state, 'delivered');
      assert.equal((await f.row()).attempts, 2);
      assert.deepEqual(
        (await f.journal()).map((entry) => entry.reason),
        ['claimed', 'reclaimed', 'delivered'],
      );
    });
  }

  it('refuses acknowledgment at lease expiry even before a second worker claims it', async () => {
    const f = await fixture();
    assert.equal(
      (
        await f.worker.runOnce('worker-a', async () => {
          f.advance(100);
        })
      ).status,
      'lease_lost',
    );
    assert.equal((await f.row()).state, 'leased');
    assert.equal((await f.worker.runOnce('worker-b', async () => {})).status, 'delivered');
    assert.equal((await f.row()).attempts, 2);
  });

  it('terminates an expired final lease without exceeding the configured attempt limit', async () => {
    const f = await fixture({ ...fixturePolicy(), maxAttempts: 1, retryDelaysMs: [] });
    const entered = gate();
    const release = gate();
    const first = f.worker.runOnce('worker-a', async () => {
      entered.release();
      await release.promise;
    });
    await entered.promise;
    f.advance(100);
    try {
      assert.equal(
        (await f.worker.runOnce('worker-b', async () => assert.fail('Attempt limit reached')))
          .status,
        'dead',
      );
    } finally {
      release.release();
    }
    assert.equal((await first).status, 'lease_lost');
    assert.equal((await f.row()).attempts, 1);
    assert.equal((await f.row()).lastError, 'LEASE_EXPIRED');
    assert.deepEqual(
      (await f.journal()).map((entry) => entry.reason),
      ['claimed', 'attempts_exhausted'],
    );
  });

  it('recovers a lost client using a new connection and the same event ID', async () => {
    const f = await fixture();
    const original = await new mongo.MongoClient(replica.getUri()).connect();
    const entered = gate();
    const release = gate();
    const seen: string[] = [];
    const worker = await openOutboxWorker({ ...f.options, client: original });
    const first = worker.runOnce('worker-a', async (message) => {
      seen.push(message.eventId);
      entered.release();
      await release.promise;
    });
    const rejected = assert.rejects(first, code('STORAGE_UNAVAILABLE'));
    await entered.promise;
    await original.close();
    f.advance(100);
    const replacement = await new mongo.MongoClient(replica.getUri()).connect();
    try {
      const recovered = await openOutboxWorker({ ...f.options, client: replacement });
      assert.equal(
        (
          await recovered.runOnce('worker-b', async (message) => {
            seen.push(message.eventId);
          })
        ).status,
        'delivered',
      );
    } finally {
      release.release();
      await replacement.close();
    }
    await rejected;
    assert.deepEqual(seen, [f.eventId, f.eventId]);
    assert.equal((await f.row()).state, 'delivered');
  });

  for (const corruption of ['missing', 'ciphertext', 'metadata', 'inner-id']) {
    it(`quarantines a ${corruption} event without calling the handler`, async () => {
      const f = await fixture();
      const events = f.collection('audit');
      if (corruption === 'missing') await events.deleteOne({});
      if (corruption === 'ciphertext')
        await events.updateOne({}, { $set: { 'body.tag': '00'.repeat(16) } });
      if (corruption === 'metadata') await events.updateOne({}, { $set: { revision: 2 } });
      if (corruption === 'inner-id') {
        const stored = await events.findOne({});
        assert.ok(stored);
        const binding = canonicalJson({
          database,
          namespace: f.options.namespace,
          eventId: stored._id,
          aggregate: stored.aggregateId,
          revision: stored.revision,
        });
        const protection = createJsonProtection(f.options.keys);
        const event = protection.open(stored.body, binding);
        assert.ok(typeof event === 'object' && event !== null);
        await events.updateOne(
          {},
          { $set: { body: protection.seal({ ...event, event_id: 'different-event' }, binding) } },
        );
      }
      assert.equal(
        (
          await f.worker.runOnce('worker-a', async () =>
            assert.fail('Invalid event must not leave worker'),
          )
        ).status,
        'dead',
      );
      assert.equal((await f.row()).lastError, 'INVALID_EVENT');
      assert.deepEqual(
        (await f.journal()).map((entry) => entry.reason),
        ['claimed', 'invalid_event'],
      );
    });
  }

  it('rolls a claim back when its delivery audit insert is rejected', async () => {
    const f = await fixture();
    await f.journalValidator({ forcedFailure: { $exists: true } });
    await assert.rejects(
      f.worker.runOnce('worker-a', async () => assert.fail('Claim must not escape abort')),
      code('STORAGE_UNAVAILABLE'),
    );
    assert.equal((await f.row()).state, 'pending');
    assert.equal((await f.row()).version, 0);
    assert.equal((await f.journal()).length, 0);
  });

  it('rolls acknowledgment back when its audit insert fails after handler success', async () => {
    const f = await fixture();
    let calls = 0;
    await assert.rejects(
      f.worker.runOnce('worker-a', async () => {
        calls++;
        await f.journalValidator({ reason: { $ne: 'delivered' } });
      }),
      code('STORAGE_UNAVAILABLE'),
    );
    assert.equal((await f.row()).state, 'leased');
    assert.equal((await f.row()).version, 1);
    assert.equal((await f.journal()).length, 1);
    await f.journalValidator({});
    f.advance(100);
    assert.equal(
      (
        await f.worker.runOnce('worker-b', async () => {
          calls++;
        })
      ).status,
      'delivered',
    );
    assert.equal(calls, 2); // At least once; the consumer must deduplicate this event ID.
  });

  it('rolls a retry schedule back when its audit insert fails', async () => {
    const f = await fixture();
    await assert.rejects(
      f.worker.runOnce('worker-a', async () => {
        await f.journalValidator({ reason: { $ne: 'retry_scheduled' } });
        throw Error('Sensitive provider failure');
      }),
      code('STORAGE_UNAVAILABLE'),
    );
    assert.equal((await f.row()).state, 'leased');
    assert.equal((await f.row()).version, 1);
    assert.equal((await f.journal()).length, 1);
  });

  it('rolls quarantine back when its audit insert fails', async () => {
    const f = await fixture();
    await f.collection('audit').deleteOne({});
    await f.journalValidator({ reason: { $ne: 'invalid_event' } });
    await assert.rejects(
      f.worker.runOnce('worker-a', async () => assert.fail('Missing event')),
      code('STORAGE_UNAVAILABLE'),
    );
    assert.equal((await f.row()).state, 'leased');
    assert.equal((await f.journal()).length, 1);
  });

  it('keeps both queue and audit unchanged when the server rejects a queue transition', async () => {
    const f = await fixture();
    await client.db(database).command({
      collMod: `${f.options.namespace}_outbox`,
      validator: { state: 'pending' },
      validationLevel: 'strict',
    });
    await assert.rejects(
      f.worker.runOnce('worker-a', async () => assert.fail('Claim rejected')),
      code('STORAGE_UNAVAILABLE'),
    );
    assert.equal((await f.row()).version, 0);
    assert.equal((await f.journal()).length, 0);
  });

  it('rejects corrupt queue state without dispatch or an implicit migration', async () => {
    const f = await fixture();
    await f.collection('outbox').updateOne({}, { $set: { format: 99 } });
    await assert.rejects(
      f.worker.runOnce('worker-a', async () => assert.fail('Unknown format')),
      code('INTEGRITY_FAILURE'),
    );
    assert.equal((await f.journal()).length, 0);
  });

  it('does not claim entries before their availability time', async () => {
    const f = await fixture();
    f.advance(-1);
    assert.equal(
      (await f.worker.runOnce('worker-a', async () => assert.fail('Not due'))).status,
      'idle',
    );
    assert.equal((await f.row()).attempts, 0);
  });

  it('validates worker identity and clock before changing queue state', async () => {
    const f = await fixture();
    await assert.rejects(
      f.worker.runOnce(' ', async () => {}),
      code('INVALID_REQUEST'),
    );
    const worker = await openOutboxWorker({ ...f.options, clock: () => 'invalid-clock' });
    await assert.rejects(
      worker.runOnce('worker-a', async () => {}),
      code('INVALID_REQUEST'),
    );
    assert.equal((await f.row()).version, 0);
    assert.equal((await f.journal()).length, 0);
  });

  it('requires a complete versioned retry policy and validates configuration before claims', async () => {
    const f = await fixture();
    for (const policy of [
      { ...fixturePolicy(), leaseDurationMs: 0 },
      { ...fixturePolicy(), maxAttempts: 0 },
      { ...fixturePolicy(), retryDelaysMs: [] },
      { ...fixturePolicy(), retryDelaysMs: [-1, 0] },
      { ...fixturePolicy(), revision: 0 },
      { ...fixturePolicy(), policyId: '' },
    ])
      await assert.rejects(
        openOutboxWorker({ ...f.options, policy }),
        code('INVALID_CONFIGURATION'),
      );
    await assert.rejects(
      openOutboxWorker({ ...f.options, database: '' }),
      code('INVALID_CONFIGURATION'),
    );
    await assert.rejects(
      openOutboxWorker({ ...f.options, namespace: '../other' }),
      code('INVALID_CONFIGURATION'),
    );
    assert.equal((await f.row()).version, 0);
  });

  it('keeps the loaded policy independent from subsequent caller mutation', async () => {
    const policy = fixturePolicy();
    const f = await fixture(policy);
    policy.retryDelaysMs[0] = 1000;
    assert.equal(
      (
        await f.worker.runOnce('worker-a', async () => {
          throw Error('Fixture');
        })
      ).status,
      'retry_scheduled',
    );
    assert.equal((await f.row()).availableAt.toISOString(), '2026-10-21T12:00:00.010Z');
  });

  it('rejects overflowing lease dates without persisting a claim', async () => {
    const f = await fixture({ ...fixturePolicy(), leaseDurationMs: Number.MAX_SAFE_INTEGER - 1 });
    await assert.rejects(
      f.worker.runOnce('worker-a', async () => assert.fail('Invalid lease')),
      code('INVALID_CONFIGURATION'),
    );
    assert.equal((await f.row()).version, 0);
    assert.equal((await f.journal()).length, 0);
  });

  it('reports storage loss through a fixed error boundary', async () => {
    const f = await fixture();
    const connection = await new mongo.MongoClient(replica.getUri()).connect();
    const worker = await openOutboxWorker({ ...f.options, client: connection });
    await connection.close();
    await assert.rejects(
      worker.runOnce('worker-a', async () => assert.fail('Closed storage')),
      code('STORAGE_UNAVAILABLE'),
    );
    assert.equal((await f.row()).attempts, 0);
  });

  it('protects the delivery audit sequence with a unique event/version index', async () => {
    const f = await fixture();
    await f.worker.runOnce('worker-a', async () => {});
    const entry = (await f.journal())[0];
    await assert.rejects(
      f.collection('delivery_audit').insertOne({ ...entry, _id: new mongo.ObjectId() }),
      (error: unknown) => error instanceof mongo.MongoServerError && error.code === 11000,
    );
    const indexes = await f.collection('outbox').indexes();
    assert.ok(indexes.some((index) => index.key.leaseUntil === 1));
    assert.ok(indexes.some((index) => index.key.availableAt === 1));
  });

  it('rejects standalone Mongo before creating queue or journal collections', async () => {
    const f = await fixture();
    const standalone = await MongoMemoryServer.create();
    const connection = await new mongo.MongoClient(standalone.getUri()).connect();
    try {
      await assert.rejects(
        openOutboxWorker({ ...f.options, client: connection }),
        code('TRANSACTIONS_REQUIRED'),
      );
      assert.equal((await connection.db(database).listCollections().toArray()).length, 0);
    } finally {
      await connection.close();
      await standalone.stop();
    }
  });
});
