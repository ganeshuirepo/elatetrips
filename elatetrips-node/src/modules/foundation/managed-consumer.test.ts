import { strict as assert } from 'node:assert';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { setImmediate as turn } from 'node:timers/promises';
import { mongo } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { z } from 'zod';
import {
  createManagedConsumer,
  ManagedConsumerError,
  type ManagedConsumerOptions,
  type ManagedConsumerPolicy,
} from './managed-consumer';
import type { RunnerRoute } from './outbox-runner';
import { openOutboxWorker, OutboxError, type DeliveryControl, type OutboxMessage } from './outbox';
import { resolvePrincipal } from './identity';
import { openVersionedStore } from './persistence';
import { deliverySchema } from './outbox-record';

const time = '2026-10-21T12:00:00.000Z';
const message: OutboxMessage = {
  eventId: 'fixture-event',
  occurredAt: time,
  receivedAt: time,
  event: {
    event_id: 'fixture-event',
    ts: time,
    actor: 'user',
    role: 'customer',
    type: 'foundation.record.created',
    kind: 'fixture-record',
    action: 'context.write',
    membershipId: 'member',
    scope: { kind: 'customer', id: 'user' },
    aggregateId: 'record',
    revision: 1,
    schemaVersion: 'fixture-v1',
    commandId: 'command',
    correlationId: 'flow',
    before: null,
    after: { note: 'Private' },
  },
};
const policy = (): ManagedConsumerPolicy => ({
  policyId: 'fixture-managed',
  revision: 1,
  enabled: true,
  heartbeatIntervalMs: 10,
  deadlineMs: 90,
});
const control: DeliveryControl = {
  renewLease: async () => ({ status: 'renewed', leaseUntil: time }),
};
const code = (expected: string) => (error: unknown) =>
  error instanceof ManagedConsumerError && error.code === expected;
function gate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function scheduler() {
  const calls: { ms: number; release(): void; reject(): void; active: boolean }[] = [];
  const wait = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const done = (error?: Error) => {
        if (!call.active) return;
        call.active = false;
        signal.removeEventListener('abort', aborted);
        if (error) reject(error);
        else resolve();
      };
      const aborted = () => done(Error('Private abort'));
      const call = {
        ms,
        release: () => done(),
        reject: () => done(Error('Private scheduler')),
        active: true,
      };
      calls.push(call);
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted();
    });
  return {
    wait,
    calls,
    fire(ms: number) {
      const call = calls.find((item) => item.active && item.ms === ms);
      if (!call) throw Error('Missing scheduled fixture wait');
      call.release();
    },
    active: () => calls.filter((item) => item.active).length,
  };
}
function options(
  handle: RunnerRoute['handle'] = async () => {},
  overrides: Partial<ManagedConsumerOptions> = {},
): ManagedConsumerOptions {
  return {
    route: { kind: 'fixture-record', schemaVersion: 'fixture-v1', handle },
    policy: policy(),
    ...overrides,
  };
}
async function cancelled(signal: AbortSignal) {
  if (!signal.aborted)
    await new Promise<void>((resolve) =>
      signal.addEventListener('abort', () => resolve(), { once: true }),
    );
}

describe('managed trusted consumer lifecycle', () => {
  it('constructs a detached frozen route without scheduling work', () => {
    const route = createManagedConsumer(
      options(async () => assert.fail('No work'), { wait: async () => assert.fail('No timers') }),
    );
    assert.equal(route.kind, 'fixture-record');
    assert.equal(Object.isFrozen(route), true);
  });
  it('rejects invalid configuration and Node timer overflow', () => {
    for (const change of [
      { heartbeatIntervalMs: 0 },
      { deadlineMs: 2 ** 31 },
      { revision: 0 },
      { policyId: ' ' },
      { heartbeatIntervalMs: Infinity },
    ])
      assert.throws(
        () => createManagedConsumer(options(undefined, { policy: { ...policy(), ...change } })),
        code('INVALID_CONFIGURATION'),
      );
    assert.throws(
      () =>
        createManagedConsumer(
          options(undefined, { route: { kind: '', schemaVersion: 'v', handle: async () => {} } }),
        ),
      code('INVALID_CONFIGURATION'),
    );
  });
  it('disabled routes reject without invoking consumers, controls or timers', async () => {
    const route = createManagedConsumer(
      options(async () => assert.fail('No consumer'), {
        policy: { ...policy(), enabled: false },
        wait: async () => assert.fail('No timer'),
      }),
    );
    await assert.rejects(
      route.handle(message, new AbortController().signal, control),
      code('DISABLED'),
    );
  });
  it('pre-aborted invocations reject before work', async () => {
    const parent = new AbortController();
    parent.abort('Private');
    await assert.rejects(
      createManagedConsumer(options(async () => assert.fail('No consumer'))).handle(
        message,
        parent.signal,
        control,
      ),
      code('CANCELLED'),
    );
  });
  it('requires a real AbortSignal and renewal capability', async () => {
    const route = createManagedConsumer(options());
    await assert.rejects(route.handle(message, JSON.parse('{}'), control), code('INVALID_REQUEST'));
    await assert.rejects(
      route.handle(message, new AbortController().signal),
      code('CONTROL_REQUIRED'),
    );
  });
  it('passes a child signal and same message/control, then cancels all pending timers', async () => {
    const timer = scheduler();
    const parent = new AbortController();
    let calls = 0;
    await createManagedConsumer(
      options(
        async (received, signal, forwarded) => {
          assert.equal(received, message);
          assert.notEqual(signal, parent.signal);
          assert.equal(signal.aborted, false);
          assert.equal(forwarded, control);
          calls++;
        },
        { wait: timer.wait },
      ),
    ).handle(message, parent.signal, control);
    assert.equal(calls, 1);
    assert.equal(timer.active(), 0);
    assert.deepEqual(
      timer.calls.map((call) => call.ms),
      [90, 10],
    );
  });
  it('heartbeats sequentially using configured intervals and stops after success', async () => {
    const timer = scheduler();
    const finish = gate();
    let calls = 0;
    const running = createManagedConsumer(
      options(async () => finish.promise, { wait: timer.wait }),
    ).handle(message, new AbortController().signal, {
      renewLease: async () => {
        calls++;
        return { status: calls === 1 ? 'unchanged' : 'renewed', leaseUntil: time };
      },
    });
    timer.fire(10);
    await turn();
    timer.fire(10);
    await turn();
    finish.release();
    await running;
    assert.equal(calls, 2);
    assert.equal(timer.active(), 0);
  });
  it('does not overlap renewals when a renewal is slow', async () => {
    const timer = scheduler();
    const renew = gate();
    const finish = gate();
    let calls = 0;
    const running = createManagedConsumer(
      options(async () => finish.promise, { wait: timer.wait }),
    ).handle(message, new AbortController().signal, {
      renewLease: async () => {
        calls++;
        await renew.promise;
        return { status: 'unchanged' };
      },
    });
    timer.fire(10);
    await turn();
    assert.equal(timer.calls.filter((call) => call.ms === 10).length, 1);
    renew.release();
    await turn();
    assert.equal(calls, 1);
    finish.release();
    await running;
  });
  it('deadline aborts cooperatively, drains cleanup and rejects even if consumer resolves', async () => {
    const timer = scheduler();
    const cleanup = gate();
    let cleaning = false;
    let returned = false;
    const running = createManagedConsumer(
      options(
        async (_, signal) => {
          await cancelled(signal);
          cleaning = true;
          await cleanup.promise;
        },
        { wait: timer.wait },
      ),
    ).handle(message, new AbortController().signal, control);
    const observed = assert.rejects(running, code('DEADLINE_EXCEEDED')).then(() => {
      returned = true;
    });
    timer.fire(90);
    await turn();
    assert.equal(cleaning, true);
    assert.equal(returned, false);
    cleanup.release();
    await observed;
    assert.equal(timer.active(), 0);
  });
  it('host cancellation uses a redacted fixed reason and cannot acknowledge a resolving consumer', async () => {
    const timer = scheduler();
    const parent = new AbortController();
    let reason: unknown;
    const running = createManagedConsumer(
      options(
        async (_, signal) => {
          await cancelled(signal);
          reason = signal.reason;
        },
        { wait: timer.wait },
      ),
    ).handle(message, parent.signal, control);
    parent.abort(Error('Private password'));
    await assert.rejects(running, code('CANCELLED'));
    assert.ok(reason instanceof ManagedConsumerError);
    assert.equal(String(reason).includes('Private'), false);
    assert.equal(timer.active(), 0);
  });
  for (const status of ['disabled', 'closed', 'limit_reached', 'lease_lost'] as const) {
    it(`stops and rejects when renewal reports ${status}`, async () => {
      const timer = scheduler();
      let aborted = false;
      const running = createManagedConsumer(
        options(
          async (_, signal) => {
            await cancelled(signal);
            aborted = true;
          },
          { wait: timer.wait },
        ),
      ).handle(message, new AbortController().signal, { renewLease: async () => ({ status }) });
      timer.fire(10);
      await assert.rejects(running, code('LEASE_UNAVAILABLE'));
      assert.equal(aborted, true);
      assert.equal(timer.active(), 0);
    });
  }
  it('renewal errors abort consumers and omit private storage details', async () => {
    const timer = scheduler();
    const running = createManagedConsumer(
      options(async (_, signal) => cancelled(signal), { wait: timer.wait }),
    ).handle(message, new AbortController().signal, {
      renewLease: async () => {
        throw Error('Private URI');
      },
    });
    timer.fire(10);
    await assert.rejects(
      running,
      (error: unknown) => code('RENEWAL_FAILED')(error) && !String(error).includes('Private'),
    );
  });
  it('consumer errors cancel waits and expose a fixed error', async () => {
    const timer = scheduler();
    await assert.rejects(
      createManagedConsumer(
        options(
          async () => {
            throw Error('Private payload');
          },
          { wait: timer.wait },
        ),
      ).handle(message, new AbortController().signal, control),
      code('HANDLER_FAILED'),
    );
    assert.equal(timer.active(), 0);
  });
  for (const milliseconds of [10, 90]) {
    it(`scheduler rejection at ${milliseconds} aborts and drains`, async () => {
      const timer = scheduler();
      const running = createManagedConsumer(
        options(async (_, signal) => cancelled(signal), { wait: timer.wait }),
      ).handle(message, new AbortController().signal, control);
      timer.calls.find((call) => call.ms === milliseconds)?.reject();
      await assert.rejects(running, code('WAIT_FAILED'));
      assert.equal(timer.active(), 0);
    });
  }
  it('drains an active renewal before returning success', async () => {
    const timer = scheduler();
    const renew = gate();
    const finish = gate();
    let returned = false;
    const running = createManagedConsumer(options(async () => finish.promise, { wait: timer.wait }))
      .handle(message, new AbortController().signal, {
        renewLease: async () => {
          await renew.promise;
          return { status: 'unchanged' };
        },
      })
      .then(() => {
        returned = true;
      });
    timer.fire(10);
    await turn();
    finish.release();
    await turn();
    assert.equal(returned, false);
    renew.release();
    await running;
    assert.equal(timer.active(), 0);
  });
  it('a failed renewal during drain prevents successful acknowledgment', async () => {
    const timer = scheduler();
    const renew = gate();
    const finish = gate();
    const running = createManagedConsumer(
      options(async () => finish.promise, { wait: timer.wait }),
    ).handle(message, new AbortController().signal, {
      renewLease: async () => {
        await renew.promise;
        throw Error('Private');
      },
    });
    const observed = assert.rejects(running, code('RENEWAL_FAILED'));
    timer.fire(10);
    await turn();
    finish.release();
    await turn();
    renew.release();
    await observed;
  });
  it('first cancellation cause survives later consumer failure', async () => {
    const timer = scheduler();
    const running = createManagedConsumer(
      options(
        async (_, signal) => {
          await cancelled(signal);
          throw Error('Cleanup');
        },
        { wait: timer.wait },
      ),
    ).handle(message, new AbortController().signal, control);
    timer.fire(90);
    await assert.rejects(running, code('DEADLINE_EXCEEDED'));
  });
  for (const cause of ['deadline', 'abort', 'lease-loss'] as const) {
    it(`${cause} after consumer success while renewal drains cannot acknowledge`, async () => {
      const timer = scheduler();
      const renew = gate();
      const finish = gate();
      const parent = new AbortController();
      let returned = false;
      const running = createManagedConsumer(
        options(async () => finish.promise, { wait: timer.wait }),
      ).handle(message, parent.signal, {
        renewLease: async () => {
          await renew.promise;
          return { status: cause === 'lease-loss' ? 'lease_lost' : 'unchanged' };
        },
      });
      const observed = assert
        .rejects(
          running,
          code(
            cause === 'deadline'
              ? 'DEADLINE_EXCEEDED'
              : cause === 'abort'
                ? 'CANCELLED'
                : 'LEASE_UNAVAILABLE',
          ),
        )
        .then(() => {
          returned = true;
        });
      timer.fire(10);
      await turn();
      finish.release();
      await turn();
      if (cause === 'deadline') timer.fire(90);
      if (cause === 'abort') parent.abort();
      await turn();
      assert.equal(returned, false);
      renew.release();
      await observed;
      assert.equal(timer.active(), 0);
    });
  }
  it('detaches policy and handler, and keeps concurrent invocation state independent', async () => {
    const timer = scheduler();
    const configured = policy();
    const finish = gate();
    let calls = 0;
    const original = options(
      async (_, signal) => {
        calls++;
        if (calls === 1) await cancelled(signal);
        else await finish.promise;
      },
      { policy: configured, wait: timer.wait },
    );
    const route = createManagedConsumer(original);
    configured.deadlineMs = 1;
    original.route.handle = async () => assert.fail('Mutated');
    const firstParent = new AbortController();
    const a = route.handle(message, firstParent.signal, control);
    const observed = assert.rejects(a, code('CANCELLED'));
    const b = route.handle(message, new AbortController().signal, control);
    firstParent.abort();
    await observed;
    assert.equal(timer.active(), 2);
    finish.release();
    await b;
    assert.equal(timer.active(), 0);
    assert.equal(calls, 2);
  });
  it('aborts actual long Node waits promptly on host cancellation', async () => {
    const parent = new AbortController();
    const entered = gate();
    const running = createManagedConsumer(
      options(
        async (_, signal) => {
          entered.release();
          await cancelled(signal);
        },
        { policy: { ...policy(), heartbeatIntervalMs: 2 ** 31 - 1, deadlineMs: 2 ** 31 - 1 } },
      ),
    ).handle(message, parent.signal, control);
    await entered.promise;
    parent.abort();
    await assert.rejects(running, code('CANCELLED'));
  });
});

describe('managed consumers with real transactional outbox leases', () => {
  let replica: MongoMemoryReplSet;
  let client: mongo.MongoClient;
  const database = `managed_test_${randomUUID().replace(/-/g, '')}`;
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
  async function fixture(disableRenewal = false) {
    const namespace = `m_${randomUUID().replace(/-/g, '')}`;
    let instant = Date.parse(time);
    const keys = {
      activeKeyId: 'fixture-key',
      encryptionKeys: new Map([['fixture-key', randomBytes(32)]]),
      fingerprintKey: randomBytes(32),
    };
    const scope = { kind: 'customer' as const, id: 'user' };
    const identity = await resolvePrincipal(
      'fixture',
      { sign: () => '', verify: () => ({ phone: 'fixture' }) },
      { findByTokenIdentifier: async () => ({ userId: 'user', active: true }) },
    );
    if (identity.status !== 'authenticated') throw Error('Fixture identity');
    const common = {
      client,
      database,
      namespace,
      keys,
      clock: () => new Date(instant).toISOString(),
    };
    const store = await openVersionedStore({
      ...common,
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
    });
    const eventId = (
      await store.write(identity.principal, {
        id: 'record',
        commandId: 'command',
        correlationId: 'flow',
        expectedRevision: 0,
        createScope: scope,
        payload: { note: 'Private' },
      })
    ).eventId;
    const worker = await openOutboxWorker({
      ...common,
      policy: {
        policyId: 'fixture-delivery',
        revision: 1,
        leaseDurationMs: 100,
        maxAttempts: 3,
        retryDelaysMs: [5, 10],
      },
      ...(!disableRenewal
        ? {
            renewal: {
              policyId: 'fixture-renewal',
              revision: 1,
              maxExtensions: 3,
              maxLifetimeMs: 350,
            },
          }
        : {}),
    });
    const collection = (suffix: string) => client.db(database).collection(`${namespace}_${suffix}`);
    return {
      worker,
      eventId,
      namespace,
      collection,
      advance: (ms: number) => {
        instant += ms;
      },
      row: async () => deliverySchema.parse(await collection('outbox').findOne({ eventId })),
    };
  }
  it('extends, excludes a replacement after original expiry, and acknowledges the renewed version', async () => {
    const f = await fixture();
    const timer = scheduler();
    const finish = gate();
    let received = false;
    const route = createManagedConsumer(
      options(
        async () => {
          received = true;
          await finish.promise;
        },
        { wait: timer.wait },
      ),
    );
    const running = f.worker.runOnce('worker', (event, capability) =>
      route.handle(event, new AbortController().signal, capability),
    );
    while (!received) await turn();
    f.advance(80);
    timer.fire(10);
    while ((await f.row()).version < 2) await turn();
    f.advance(30);
    let replacementCalled = false;
    const replacement = await f.worker.runOnce('replacement', async () => {
      replacementCalled = true;
    });
    finish.release();
    const result = await running;
    assert.deepEqual(replacement, { status: 'idle' });
    assert.equal(replacementCalled, false);
    assert.equal(result.status, 'delivered');
    const rows = await f.collection('delivery_audit').find().sort({ version: 1 }).toArray();
    assert.deepEqual(
      rows.map((row) => row.reason),
      ['claimed', 'lease_renewed', 'delivered'],
    );
    assert.equal(timer.active(), 0);
  });
  it('deadline resolution still schedules a retry instead of delivered', async () => {
    const f = await fixture();
    const timer = scheduler();
    let started = false;
    const route = createManagedConsumer(
      options(
        async (_, signal) => {
          started = true;
          await cancelled(signal);
        },
        { wait: timer.wait },
      ),
    );
    const running = f.worker.runOnce('worker', (event, capability) =>
      route.handle(event, new AbortController().signal, capability),
    );
    while (!started) await turn();
    timer.fire(90);
    assert.equal((await running).status, 'retry_scheduled');
    assert.equal((await f.row()).lastError, 'DELIVERY_FAILED');
    assert.equal(timer.active(), 0);
  });
  it('lease loss stops the consumer and cannot finish a replacement lease', async () => {
    const f = await fixture();
    const timer = scheduler();
    let started = false;
    const replacementGate = gate();
    const replacementStarted = gate();
    const route = createManagedConsumer(
      options(
        async (_, signal) => {
          started = true;
          await cancelled(signal);
        },
        { wait: timer.wait },
      ),
    );
    const running = f.worker.runOnce('worker', (event, capability) =>
      route.handle(event, new AbortController().signal, capability),
    );
    while (!started) await turn();
    f.advance(100);
    const newer = f.worker.runOnce('worker', async () => {
      replacementStarted.release();
      await replacementGate.promise;
    });
    await replacementStarted.promise;
    timer.fire(10);
    const result = await running;
    replacementGate.release();
    const newerResult = await newer;
    assert.equal(result.status, 'lease_lost');
    assert.equal(newerResult.status, 'delivered');
    assert.equal((await f.row()).attempts, 2);
  });
  it('disabled renewal aborts managed work and schedules a retry', async () => {
    const f = await fixture(true);
    const timer = scheduler();
    let started = false;
    const route = createManagedConsumer(
      options(
        async (_, signal) => {
          started = true;
          await cancelled(signal);
        },
        { wait: timer.wait },
      ),
    );
    const running = f.worker.runOnce('worker', (event, capability) =>
      route.handle(event, new AbortController().signal, capability),
    );
    while (!started) await turn();
    timer.fire(10);
    assert.equal((await running).status, 'retry_scheduled');
    assert.equal(timer.active(), 0);
  });
  it('renewal audit failure drains and prevents worker acknowledgment even if caught by consumer', async () => {
    const f = await fixture();
    const timer = scheduler();
    let started = false;
    await client.db(database).command({
      collMod: `${f.namespace}_delivery_audit`,
      validator: { reason: { $ne: 'lease_renewed' } },
      validationLevel: 'strict',
    });
    const route = createManagedConsumer(
      options(
        async (_, signal) => {
          started = true;
          await cancelled(signal);
        },
        { wait: timer.wait },
      ),
    );
    const running = f.worker.runOnce('worker', async (event, capability) => {
      try {
        await route.handle(event, new AbortController().signal, capability);
      } catch {
        /* simulate consumer ignoring wrapper failure */
      }
    });
    const observed = assert.rejects(
      running,
      (error: unknown) => error instanceof OutboxError && error.code === 'STORAGE_UNAVAILABLE',
    );
    while (!started) await turn();
    f.advance(80);
    timer.fire(10);
    await observed;
    const row = await f.row();
    assert.equal(row.state, 'leased');
    assert.equal(row.version, 1);
    assert.equal(timer.active(), 0);
  });
});
