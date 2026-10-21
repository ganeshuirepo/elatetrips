import { strict as assert } from 'node:assert';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { setImmediate as turn } from 'node:timers/promises';
import { mongo } from 'mongoose';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { z } from 'zod';
import {
  createDeliveryRuntime,
  DeliveryRuntimeError,
  type DeliveryRuntimeOptions,
} from './delivery-runtime';
import { OutboxRunnerError } from './outbox-runner';
import { resolvePrincipal } from './identity';
import { openVersionedStore } from './persistence';
import { openSnapshotProjection } from './projection';
import { deliverySchema } from './outbox-record';

const time = '2026-10-21T12:00:00.000Z';
function options(
  client = new mongo.MongoClient('mongodb://127.0.0.1:1/runtime', { serverSelectionTimeoutMS: 30 }),
): DeliveryRuntimeOptions {
  return {
    client,
    database: 'runtime_fixture',
    namespace: `r_${randomUUID().replace(/-/g, '')}`,
    keys: {
      activeKeyId: 'fixture',
      encryptionKeys: new Map([['fixture', randomBytes(32)]]),
      fingerprintKey: randomBytes(32),
    },
    clock: () => time,
    policy: {
      policyId: 'delivery',
      revision: 1,
      leaseDurationMs: 100,
      maxAttempts: 2,
      retryDelaysMs: [5],
    },
    renewal: { policyId: 'renewal', revision: 1, maxExtensions: 10, maxLifetimeMs: 190 },
    workerId: 'fixture-worker',
    runnerPolicy: {
      policyId: 'runner',
      revision: 1,
      enabled: true,
      idleDelayMs: 5,
      workDelayMs: 0,
      storageRetryDelaysMs: [],
    },
    managedPolicy: {
      policyId: 'managed',
      revision: 1,
      enabled: true,
      heartbeatIntervalMs: 10,
      deadlineMs: 90,
    },
    routes: [{ kind: 'fixture-record', schemaVersion: 'fixture-v1', handle: async () => {} }],
  };
}
function invalid(error: unknown) {
  return error instanceof DeliveryRuntimeError && error.code === 'INVALID_CONFIGURATION';
}
function fault(error: unknown) {
  return (
    error instanceof OutboxRunnerError &&
    error.code === 'WORKER_FAILED' &&
    error.message === 'WORKER_FAILED'
  );
}
function gate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function scheduler() {
  const calls: { ms: number; active: boolean; fire(): void }[] = [];
  return {
    calls,
    wait: (ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        const finish = () => {
          if (!call.active) return;
          call.active = false;
          signal.removeEventListener('abort', finish);
          resolve();
        };
        const call = { ms, active: true, fire: finish };
        calls.push(call);
        signal.addEventListener('abort', finish, { once: true });
        if (signal.aborted) finish();
      }),
    fire(ms: number) {
      const call = calls.find((entry) => entry.active && entry.ms === ms);
      assert.ok(call);
      call.fire();
    },
    active: () => calls.filter((entry) => entry.active).length,
  };
}

describe('managed delivery runtime configuration and lazy lifecycle', () => {
  it('constructs a frozen runtime without accessing DB, scheduler or consumer', () => {
    const config = options();
    config.client.db = () => assert.fail('No DB access');
    config.runnerWait = config.consumerWait = async () => assert.fail('No scheduler');
    config.routes = [{ ...config.routes[0], handle: async () => assert.fail('No consumer') }];
    const runtime = createDeliveryRuntime(config);
    assert.equal(Object.isFrozen(runtime), true);
    assert.equal(runtime.snapshot().state, 'ready');
  });
  it('disabled runtime does not open storage even with no routes or renewal', async () => {
    const config = options();
    config.runnerPolicy.enabled = false;
    config.managedPolicy.enabled = false;
    config.routes = [];
    config.renewal = undefined;
    config.client.db = () => assert.fail('No DB access');
    assert.equal(
      (await createDeliveryRuntime(config).run(new AbortController().signal)).state,
      'disabled',
    );
  });
  it('pre-aborted enabled run does not initialize storage', async () => {
    const config = options();
    config.client.db = () => assert.fail('No DB access');
    const stop = new AbortController();
    stop.abort('private reason');
    assert.equal((await createDeliveryRuntime(config).run(stop.signal)).state, 'stopped');
  });
  const invalidConfigs: [string, (value: DeliveryRuntimeOptions) => void][] = [
    [
      'missing renewal',
      (value) => {
        value.renewal = undefined;
      },
    ],
    [
      'disabled managed policy',
      (value) => {
        value.managedPolicy.enabled = false;
      },
    ],
    [
      'empty routes',
      (value) => {
        value.routes = [];
      },
    ],
    [
      'duplicate routes',
      (value) => {
        value.routes = [value.routes[0], value.routes[0]];
      },
    ],
    [
      'heartbeat at lease duration',
      (value) => {
        value.managedPolicy.heartbeatIntervalMs = 100;
      },
    ],
    [
      'insufficient lifetime',
      (value) => {
        if (value.renewal) value.renewal.maxLifetimeMs = 189;
      },
    ],
    [
      'insufficient extensions',
      (value) => {
        if (value.renewal) value.renewal.maxExtensions = 9;
      },
    ],
    [
      'invalid key',
      (value) => {
        value.keys.fingerprintKey = Buffer.alloc(1);
      },
    ],
    [
      'invalid namespace',
      (value) => {
        value.namespace = 'bad.scope';
      },
    ],
    [
      'invalid database',
      (value) => {
        value.database = 'bad/name';
      },
    ],
    [
      'invalid timer',
      (value) => {
        value.managedPolicy.deadlineMs = 2 ** 31;
      },
    ],
    [
      'invalid retry schedule',
      (value) => {
        value.policy.retryDelaysMs = [];
      },
    ],
    [
      'invalid worker ID',
      (value) => {
        value.workerId = ' ';
      },
    ],
    [
      'invalid handler',
      (value) => {
        value.routes = [{ kind: ' ', schemaVersion: 'v', handle: async () => {} }];
      },
    ],
  ];
  for (const [name, change] of invalidConfigs)
    it(`rejects ${name} before DB access`, () => {
      const config = options();
      config.client.db = () => assert.fail('No DB access');
      change(config);
      assert.throws(() => createDeliveryRuntime(config), invalid);
    });
  it('accepts exact conservative extension/lifetime bounds', () => {
    assert.equal(createDeliveryRuntime(options()).snapshot().state, 'ready');
  });
  it('rejects invalid signal and single-use restart without opening storage', async () => {
    const config = options();
    config.runnerPolicy.enabled = false;
    config.client.db = () => assert.fail('No DB access');
    const runtime = createDeliveryRuntime(config);
    await assert.rejects(
      runtime.run(JSON.parse('{}')),
      (error: unknown) => error instanceof OutboxRunnerError && error.code === 'INVALID_REQUEST',
    );
    await runtime.run(new AbortController().signal);
    await assert.rejects(
      runtime.run(new AbortController().signal),
      (error: unknown) => error instanceof OutboxRunnerError && error.code === 'ALREADY_STARTED',
    );
  });
  it('retries failed lazy openings with bounded configured delays and redacts private failures', async () => {
    const config = options();
    let opens = 0;
    const waits: number[] = [];
    config.client.db = () => {
      opens++;
      throw Error('private storage address/password');
    };
    config.runnerPolicy.storageRetryDelaysMs = [3, 7];
    config.runnerWait = async (ms) => {
      waits.push(ms);
    };
    const runtime = createDeliveryRuntime(config);
    await assert.rejects(runtime.run(new AbortController().signal), fault);
    assert.equal(opens, 3);
    assert.deepEqual(waits, [3, 7]);
    assert.equal(runtime.snapshot().counts.storageErrors, 3);
    assert.equal(runtime.snapshot().state, 'faulted');
  });
  it('cancellation during initialization backoff prevents another opening', async () => {
    const config = options();
    const stop = new AbortController();
    let opens = 0;
    config.client.db = () => {
      opens++;
      throw Error('private');
    };
    config.runnerPolicy.storageRetryDelaysMs = [3];
    config.runnerWait = async () => {
      stop.abort();
    };
    assert.equal((await createDeliveryRuntime(config).run(stop.signal)).state, 'stopped');
    assert.equal(opens, 1);
  });
  it('unavailable storage follows the same bounded redacted fault path', async () => {
    const config = options();
    try {
      const runtime = createDeliveryRuntime(config);
      await assert.rejects(runtime.run(new AbortController().signal), fault);
      assert.equal(runtime.snapshot().counts.storageErrors, 1);
    } finally {
      await config.client.close();
    }
  });
});

describe('real Mongo managed delivery runtime composition', () => {
  let replica: MongoMemoryReplSet;
  let client: mongo.MongoClient;
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
    const config = options(client);
    let instant = Date.parse(time);
    config.clock = () => new Date(instant).toISOString();
    const scope = { kind: 'customer' as const, id: 'fixture-user' };
    const identity = await resolvePrincipal(
      'fixture',
      { sign: () => '', verify: () => ({ phone: 'fixture' }) },
      { findByTokenIdentifier: async () => ({ userId: scope.id, active: true }) },
    );
    if (identity.status !== 'authenticated') throw Error('Fixture identity');
    const common = {
      client,
      database: config.database,
      namespace: config.namespace,
      keys: config.keys,
      clock: config.clock,
      kind: 'fixture-record',
      schemaVersion: 'fixture-v1',
      schema: z.object({ note: z.string() }).strict(),
      memberships: {
        listForUser: async (userId: string) => [
          {
            membershipId: 'member',
            userId,
            scope,
            role: 'customer',
            active: true,
            validFrom: null,
            expiresAt: null,
          },
        ],
      },
      loadPolicy: async () => ({
        policyId: 'access',
        revision: 1,
        grants: [
          { action: 'context.write', roles: ['customer'] },
          { action: 'context.read', roles: ['customer'] },
        ],
      }),
    };
    const store = await openVersionedStore({
      ...common,
      mode: 'mutable',
      readAction: 'context.read',
      writeAction: 'context.write',
    });
    const event = await store.write(identity.principal, {
      id: 'record',
      commandId: 'command',
      correlationId: 'flow',
      expectedRevision: 0,
      createScope: scope,
      payload: { note: 'private synthetic' },
    });
    const projection = await openSnapshotProjection({
      ...common,
      projectionId: 'mirror',
      readAction: 'context.read',
    });
    const collection = (suffix: string) =>
      client.db(config.database).collection(`${config.namespace}_${suffix}`);
    return {
      config,
      projection,
      event,
      collection,
      advance: (ms: number) => {
        instant += ms;
      },
      row: async () =>
        deliverySchema.parse(await collection('outbox').findOne({ eventId: event.eventId })),
    };
  }
  it('lazily opens, renews and commits a single projection before acknowledging', async () => {
    const f = await fixture();
    const timer = scheduler();
    const ready = gate();
    const finish = gate();
    const stop = new AbortController();
    f.config.consumerWait = timer.wait;
    f.config.runnerWait = async () => {
      stop.abort();
    };
    f.config.routes = [
      {
        kind: 'fixture-record',
        schemaVersion: 'fixture-v1',
        handle: async (message) => {
          await f.projection.apply(message.eventId);
          ready.release();
          await finish.promise;
        },
      },
    ];
    const runtime = createDeliveryRuntime(f.config);
    const running = runtime.run(stop.signal);
    await ready.promise;
    f.advance(80);
    timer.fire(10);
    while ((await f.row()).version < 2) await turn();
    f.advance(30);
    finish.release();
    const report = await running;
    assert.equal(report.counts.delivered, 1);
    assert.equal((await f.row()).state, 'delivered');
    assert.equal(timer.active(), 0);
    assert.equal(await f.collection('projection_receipts').countDocuments(), 1);
    assert.deepEqual(
      (await f.collection('delivery_audit').find().sort({ version: 1 }).toArray()).map(
        (row) => row.reason,
      ),
      ['claimed', 'lease_renewed', 'delivered'],
    );
    assert.equal((await client.db(f.config.database).command({ ping: 1 })).ok, 1);
  });
  it('detaches mutable routes, policy arrays, options and key buffers before lazy opening', async () => {
    const f = await fixture();
    const stop = new AbortController();
    let called = 0;
    f.config.runnerWait = async () => {
      stop.abort();
    };
    const route = {
      kind: 'fixture-record',
      schemaVersion: 'fixture-v1',
      handle: async () => {
        called++;
      },
    };
    f.config.routes = [route];
    const runtime = createDeliveryRuntime(f.config);
    route.kind = 'changed';
    route.schemaVersion = 'changed';
    route.handle = async () => assert.fail('Mutated handler');
    f.config.runnerPolicy.enabled = false;
    f.config.runnerPolicy.storageRetryDelaysMs.push(900);
    f.config.managedPolicy.enabled = false;
    f.config.managedPolicy.heartbeatIntervalMs = 0;
    if (f.config.renewal) f.config.renewal.maxLifetimeMs = 0;
    f.config.policy.retryDelaysMs.length = 0;
    f.config.keys.fingerprintKey.fill(0);
    for (const key of f.config.keys.encryptionKeys.values()) key.fill(0);
    f.config.keys.activeKeyId = 'changed';
    f.config.namespace = 'changed';
    f.config.database = 'changed';
    f.config.client = new mongo.MongoClient('mongodb://127.0.0.1:1/changed');
    f.config.clock = () => 'invalid';
    const report = await runtime.run(stop.signal);
    assert.equal(called, 1);
    assert.equal(report.counts.delivered, 1);
  });
  it('does not cache a rejected initialization and successfully opens on the configured retry', async () => {
    const f = await fixture();
    const retryClient = await new mongo.MongoClient(replica.getUri()).connect();
    const original = retryClient.db.bind(retryClient);
    let opens = 0;
    const stop = new AbortController();
    retryClient.db = (...args) => {
      if (++opens === 1) throw Error('private transient');
      return original(...args);
    };
    f.config.client = retryClient;
    f.config.runnerPolicy.storageRetryDelaysMs = [1];
    f.config.runnerWait = async (ms) => {
      if (ms !== 1) stop.abort();
    };
    try {
      const report = await createDeliveryRuntime(f.config).run(stop.signal);
      assert.equal(opens, 2);
      assert.equal(report.counts.storageErrors, 1);
      assert.equal(report.counts.delivered, 1);
    } finally {
      await retryClient.close();
    }
  });
  for (const mode of ['host cancellation', 'deadline'] as const)
    it(`${mode} drains consumer timers and schedules a retry without acknowledgment`, async () => {
      const f = await fixture();
      const timer = scheduler();
      const ready = gate();
      const stop = new AbortController();
      f.config.consumerWait = timer.wait;
      f.config.runnerWait = async () => stop.abort();
      f.config.routes = [
        {
          kind: 'fixture-record',
          schemaVersion: 'fixture-v1',
          handle: async (_, signal) => {
            ready.release();
            await new Promise<void>((resolve) =>
              signal.addEventListener('abort', () => resolve(), { once: true }),
            );
          },
        },
      ];
      const running = createDeliveryRuntime(f.config).run(stop.signal);
      await ready.promise;
      if (mode === 'deadline') timer.fire(90);
      else stop.abort('private cancellation');
      const report = await running;
      assert.equal(report.counts.retry_scheduled, 1);
      assert.equal((await f.row()).state, 'pending');
      assert.equal(timer.active(), 0);
      assert.equal((await client.db(f.config.database).command({ ping: 1 })).ok, 1);
    });
  it('rejects standalone initialization without creating queues or consuming work', async () => {
    const standalone = await MongoMemoryServer.create();
    const single = await new mongo.MongoClient(standalone.getUri()).connect();
    try {
      const config = options(single);
      let waits = 0;
      config.runnerPolicy.storageRetryDelaysMs = [1];
      config.runnerWait = async () => {
        waits++;
      };
      const runtime = createDeliveryRuntime(config);
      await assert.rejects(runtime.run(new AbortController().signal), fault);
      assert.equal(waits, 0);
      assert.equal(runtime.snapshot().counts.storageErrors, 0);
      assert.equal((await single.db(config.database).listCollections().toArray()).length, 0);
    } finally {
      await single.close();
      await standalone.stop();
    }
  });
});
