import { strict as assert } from 'node:assert';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { mongo } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { z } from 'zod';
import { resolvePrincipal } from './identity';
import { openVersionedStore } from './persistence';
import { openSnapshotProjection } from './projection';
import { deliverySchema } from './outbox-record';
import { openOutboxWorker, OutboxError, type DeliveryResult, type OutboxMessage } from './outbox';
import {
  createOutboxRunner,
  OutboxRunnerError,
  type RunnerOptions,
  type RunnerPolicy,
} from './outbox-runner';

const time = '2026-10-21T12:00:00.000Z';
const policy = (): RunnerPolicy => ({
  policyId: 'fixture-runner',
  revision: 1,
  enabled: true,
  idleDelayMs: 100,
  workDelayMs: 5,
  storageRetryDelaysMs: [10, 20],
});
function code(expected: string) {
  return (error: unknown) => error instanceof OutboxRunnerError && error.code === expected;
}
function gate() {
  let release: () => void = () => {
    throw Error('Uninitialized gate');
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function base(overrides: Partial<RunnerOptions> = {}): RunnerOptions {
  return {
    worker: { runOnce: async () => ({ status: 'idle' }) },
    workerId: 'fixture-worker',
    policy: policy(),
    routes: [],
    ...overrides,
  };
}
const message: OutboxMessage = {
  eventId: 'event-a',
  occurredAt: time,
  receivedAt: time,
  event: {
    event_id: 'event-a',
    ts: time,
    actor: 'fixture-user',
    role: 'customer',
    type: 'foundation.record.created',
    kind: 'fixture-record',
    action: 'context.write',
    membershipId: 'fixture-member',
    scope: { kind: 'customer', id: 'fixture-user' },
    aggregateId: 'record-a',
    revision: 1,
    schemaVersion: 'fixture-v1',
    commandId: 'command-a',
    correlationId: 'flow-a',
    before: null,
    after: { note: 'Private fixture content' },
  },
};

describe('explicit sequential outbox runner lifecycle', () => {
  it('constructs without claims, consumers or timers', () => {
    const runner = createOutboxRunner(
      base({
        worker: { runOnce: async () => assert.fail('No claim') },
        wait: async () => assert.fail('No timer'),
      }),
    );
    assert.equal(runner.snapshot().state, 'ready');
  });
  it('disabled configuration starts no work', async () => {
    const runner = createOutboxRunner(
      base({
        policy: { ...policy(), enabled: false },
        worker: { runOnce: async () => assert.fail('Disabled') },
      }),
    );
    assert.equal((await runner.run(new AbortController().signal)).state, 'disabled');
  });
  it('a pre-aborted signal starts no work or delay', async () => {
    const controller = new AbortController();
    controller.abort('Private cancellation');
    const runner = createOutboxRunner(
      base({
        worker: { runOnce: async () => assert.fail('Stopped') },
        wait: async () => assert.fail('Stopped'),
      }),
    );
    assert.equal((await runner.run(controller.signal)).state, 'stopped');
  });
  it('applies configured idle/work delays to every worker result without overlap', async () => {
    const controller = new AbortController();
    const results: DeliveryResult[] = [
      { status: 'idle' },
      ...(['delivered', 'retry_scheduled', 'dead', 'lease_lost'] as const).map((status) => ({
        status,
        eventId: 'event-a',
      })),
    ];
    const waits: number[] = [];
    const runner = createOutboxRunner(
      base({
        worker: {
          runOnce: async (workerId) => {
            assert.equal(workerId, 'fixture-worker');
            const next = results.shift();
            if (!next) return assert.fail('Extra claim');
            return next;
          },
        },
        wait: async (ms) => {
          waits.push(ms);
          if (!results.length) controller.abort();
        },
      }),
    );
    const report = await runner.run(controller.signal);
    assert.deepEqual(waits, [100, 5, 5, 5, 5]);
    assert.deepEqual(report.counts, {
      idle: 1,
      delivered: 1,
      retry_scheduled: 1,
      dead: 1,
      lease_lost: 1,
      storageErrors: 0,
      unroutable: 0,
    });
  });
  it('cancels an actual long Node timer promptly without another claim', async () => {
    const controller = new AbortController();
    let claims = 0;
    const entered = gate();
    const runner = createOutboxRunner(
      base({
        policy: { ...policy(), idleDelayMs: 2 ** 31 - 1 },
        worker: {
          runOnce: async () => {
            claims++;
            entered.release();
            return { status: 'idle' };
          },
        },
      }),
    );
    const running = runner.run(controller.signal);
    await entered.promise;
    await yieldTurn(); // Let runOnce resolve and install the real timer before aborting it.
    controller.abort();
    assert.equal((await running).state, 'stopped');
    assert.equal(claims, 1);
  });
  it('rejects concurrent starts and restarting a consumed runner', async () => {
    const controller = new AbortController();
    const entered = gate();
    const release = gate();
    const runner = createOutboxRunner(
      base({
        worker: {
          runOnce: async () => {
            entered.release();
            await release.promise;
            return { status: 'idle' };
          },
        },
      }),
    );
    const running = runner.run(controller.signal);
    await entered.promise;
    await assert.rejects(runner.run(controller.signal), code('ALREADY_STARTED'));
    controller.abort();
    release.release();
    await running;
    await assert.rejects(runner.run(new AbortController().signal), code('ALREADY_STARTED'));
  });
  it('uses exact kind/schema routes, with no delimiter collision or fallback', async () => {
    const controller = new AbortController();
    let calls = 0;
    const routed = { ...message, event: { ...message.event, kind: 'a:b', schemaVersion: 'c' } };
    const runner = createOutboxRunner(
      base({
        routes: [
          {
            kind: 'a:b',
            schemaVersion: 'c',
            handle: async (received, signal) => {
              assert.equal(received, routed);
              assert.equal(signal, controller.signal);
              calls++;
            },
          },
          { kind: 'a', schemaVersion: 'b:c', handle: async () => assert.fail('Collision') },
        ],
        worker: {
          runOnce: async (_, handle) => {
            await handle(routed);
            controller.abort();
            return { status: 'delivered', eventId: routed.eventId };
          },
        },
      }),
    );
    assert.equal((await runner.run(controller.signal)).counts.delivered, 1);
    assert.equal(calls, 1);
  });
  it('unmapped schema/kind throws to the worker instead of acknowledging', async () => {
    const controller = new AbortController();
    let claims = 0;
    const runner = createOutboxRunner(
      base({
        routes: [
          {
            kind: message.event.kind,
            schemaVersion: 'another-version',
            handle: async () => assert.fail('Wrong version'),
          },
        ],
        worker: {
          runOnce: async (_, handle) => {
            claims++;
            await assert.rejects(handle(message), /No configured consumer/);
            controller.abort();
            return { status: 'retry_scheduled', eventId: message.eventId };
          },
        },
      }),
    );
    const report = await runner.run(controller.signal);
    assert.equal(claims, 1);
    assert.equal(report.counts.unroutable, 1);
    assert.equal(report.counts.delivered, 0);
  });
  it('backs off storage failures with a finite configured consecutive-error budget', async () => {
    const waits: number[] = [];
    let claims = 0;
    const runner = createOutboxRunner(
      base({
        worker: {
          runOnce: async () => {
            claims++;
            throw new OutboxError('STORAGE_UNAVAILABLE');
          },
        },
        wait: async (ms) => {
          waits.push(ms);
        },
      }),
    );
    await assert.rejects(runner.run(new AbortController().signal), code('WORKER_FAILED'));
    assert.deepEqual(waits, [10, 20]);
    assert.equal(claims, 3);
    assert.equal(runner.snapshot().state, 'faulted');
    assert.equal(runner.snapshot().counts.storageErrors, 3);
  });
  it('a successful iteration resets the consecutive storage failure budget', async () => {
    const controller = new AbortController();
    let claims = 0;
    const waits: number[] = [];
    const runner = createOutboxRunner(
      base({
        policy: { ...policy(), storageRetryDelaysMs: [7] },
        worker: {
          runOnce: async () => {
            claims++;
            if (claims === 1 || claims === 3) throw new OutboxError('STORAGE_UNAVAILABLE');
            if (claims === 4) controller.abort();
            return { status: 'idle' };
          },
        },
        wait: async (ms) => {
          waits.push(ms);
        },
      }),
    );
    assert.equal((await runner.run(controller.signal)).counts.storageErrors, 2);
    assert.deepEqual(waits, [7, 100, 7]);
  });
  it('cancellation interrupts infrastructure backoff without consuming another attempt', async () => {
    const controller = new AbortController();
    let claims = 0;
    const runner = createOutboxRunner(
      base({
        worker: {
          runOnce: async () => {
            claims++;
            throw new OutboxError('STORAGE_UNAVAILABLE');
          },
        },
        wait: async (_, signal) => {
          assert.equal(signal, controller.signal);
          controller.abort();
          throw Error('Aborted');
        },
      }),
    );
    assert.equal((await runner.run(controller.signal)).state, 'stopped');
    assert.equal(claims, 1);
  });

  it('an empty storage retry schedule fails on the first storage error', async () => {
    const runner = createOutboxRunner(
      base({
        policy: { ...policy(), storageRetryDelaysMs: [] },
        worker: {
          runOnce: async () => {
            throw new OutboxError('STORAGE_UNAVAILABLE');
          },
        },
        wait: async () => assert.fail('No retry configured'),
      }),
    );
    await assert.rejects(runner.run(new AbortController().signal), code('WORKER_FAILED'));
    assert.equal(runner.snapshot().counts.storageErrors, 1);
  });
  it('fails closed on non-storage errors and redacts exceptions and malformed results', async () => {
    const failures: unknown[] = [
      new OutboxError('INVALID_REQUEST'),
      new Error('Private URI/password'),
    ];
    for (const failure of failures) {
      const runner = createOutboxRunner(
        base({
          worker: {
            runOnce: async () => {
              throw failure;
            },
          },
          wait: async () => assert.fail('No retry'),
        }),
      );
      await assert.rejects(
        runner.run(new AbortController().signal),
        (error: unknown) => code('WORKER_FAILED')(error) && !String(error).includes('Private'),
      );
    }
    const runner = createOutboxRunner(
      base({
        worker: { runOnce: async () => JSON.parse('{"status":"secret","eventId":"private"}') },
      }),
    );
    await assert.rejects(runner.run(new AbortController().signal), code('WORKER_FAILED'));
  });
  it('scheduler failures are bounded and expose no private scheduler details', async () => {
    const runner = createOutboxRunner(
      base({
        wait: async () => {
          throw Error('Private scheduler');
        },
      }),
    );
    await assert.rejects(runner.run(new AbortController().signal), code('WAIT_FAILED'));
    assert.equal(runner.snapshot().state, 'faulted');
  });
  it('detaches caller-owned routes/policy and returns independent metadata-only reports', async () => {
    const controller = new AbortController();
    let calls = 0;
    const routes = [
      {
        kind: message.event.kind,
        schemaVersion: message.event.schemaVersion,
        handle: async () => {
          calls++;
        },
      },
    ];
    const configured = policy();
    const waits: number[] = [];
    const runner = createOutboxRunner(
      base({
        policy: configured,
        routes,
        worker: {
          runOnce: async (_, handle) => {
            await handle(message);
            return { status: 'delivered', eventId: message.eventId };
          },
        },
        wait: async (ms) => {
          waits.push(ms);
          controller.abort();
        },
      }),
    );
    configured.workDelayMs = 200;
    routes[0].handle = async () => assert.fail('Mutated route');
    routes.length = 0;
    const report = await runner.run(controller.signal);
    report.counts.delivered = 900;
    assert.equal(calls, 1);
    assert.deepEqual(waits, [5]);
    assert.equal(runner.snapshot().counts.delivered, 1);
    assert.equal(JSON.stringify(runner.snapshot()).includes('Private'), false);
    assert.equal('eventId' in report, false);
  });
  it('rejects invalid policy, duplicate routes, invalid adapters and timer overflow', () => {
    const badPolicies = [
      { ...policy(), idleDelayMs: 0 },
      { ...policy(), workDelayMs: -1 },
      { ...policy(), idleDelayMs: 2 ** 31 },
      { ...policy(), storageRetryDelaysMs: [0] },
      { ...policy(), storageRetryDelaysMs: [Infinity] },
      { ...policy(), revision: 0 },
      { ...policy(), extra: true },
    ];
    for (const bad of badPolicies)
      assert.throws(() => createOutboxRunner(base({ policy: bad })), code('INVALID_CONFIGURATION'));
    const route = { kind: 'fixture', schemaVersion: 'v1', handle: async () => {} };
    assert.throws(
      () => createOutboxRunner(base({ routes: [route, route] })),
      code('INVALID_CONFIGURATION'),
    );
    assert.throws(
      () => createOutboxRunner(base({ routes: [{ ...route, kind: ' ' }] })),
      code('INVALID_CONFIGURATION'),
    );
    assert.throws(() => createOutboxRunner(base({ workerId: ' ' })), code('INVALID_CONFIGURATION'));
    assert.throws(
      () => createOutboxRunner({ ...base(), worker: JSON.parse('{}') }),
      code('INVALID_CONFIGURATION'),
    );
  });
  it('validates signals before consuming the runner', async () => {
    const runner = createOutboxRunner(base());
    await assert.rejects(runner.run(JSON.parse('{}')), code('INVALID_REQUEST'));
    assert.equal(runner.snapshot().state, 'ready');
    const controller = new AbortController();
    controller.abort();
    await runner.run(controller.signal);
  });
});

describe('real Mongo producer/runner/projection lifecycle', () => {
  let replica: MongoMemoryReplSet;
  let client: mongo.MongoClient;
  const database = `runner_test_${randomUUID().replace(/-/g, '')}`;
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
    const keys = {
      activeKeyId: 'fixture-key',
      encryptionKeys: new Map([['fixture-key', randomBytes(32)]]),
      fingerprintKey: randomBytes(32),
    };
    let instant = Date.parse(time);
    const scope = { kind: 'customer' as const, id: 'fixture-user' };
    const identity = await resolvePrincipal(
      'fixture',
      { sign: () => '', verify: () => ({ phone: 'fixture' }) },
      { findByTokenIdentifier: async () => ({ userId: scope.id, active: true }) },
    );
    if (identity.status !== 'authenticated') throw Error('Fixture identity');
    const shared = {
      client,
      database,
      namespace,
      keys,
      clock: () => new Date(instant).toISOString(),
      loadPolicy: async () => ({
        policyId: 'fixture-access',
        revision: 1,
        grants: [
          { action: 'context.write' as const, roles: ['customer' as const] },
          { action: 'context.read' as const, roles: ['customer' as const] },
        ],
      }),
      memberships: {
        listForUser: async (userId: string) => [
          {
            membershipId: 'fixture-member',
            userId,
            scope,
            role: 'customer' as const,
            active: true,
            validFrom: null,
            expiresAt: null,
          },
        ],
      },
      kind: 'fixture-record',
      schemaVersion: 'fixture-v1',
      schema: z.object({ note: z.string() }).strict(),
      readAction: 'context.read' as const,
    };
    const store = await openVersionedStore({
      ...shared,
      mode: 'mutable',
      writeAction: 'context.write',
    });
    const seed = (id: string) =>
      store.write(identity.principal, {
        id,
        commandId: `command-${id}`,
        correlationId: 'flow',
        expectedRevision: 0,
        createScope: scope,
        payload: { note: `Private ${id}` },
      });
    const eventId = (await seed('record-a')).eventId;
    const worker = await openOutboxWorker({
      ...shared,
      policy: {
        policyId: 'fixture-delivery',
        revision: 1,
        leaseDurationMs: 100,
        maxAttempts: 2,
        retryDelaysMs: [10],
      },
    });
    const projection = await openSnapshotProjection({ ...shared, projectionId: 'fixture-mirror' });
    const collection = (suffix: string) => client.db(database).collection(`${namespace}_${suffix}`);
    const row = async () => deliverySchema.parse(await collection('outbox').findOne({ eventId }));
    const controller = new AbortController();
    const options = (handle: RunnerOptions['routes'][number]['handle']): RunnerOptions => ({
      worker,
      workerId: 'fixture-worker',
      policy: policy(),
      routes: [{ kind: shared.kind, schemaVersion: shared.schemaVersion, handle }],
      wait: async (ms) => {
        instant += ms;
      },
    });
    return {
      controller,
      options,
      worker,
      eventId,
      projection,
      principal: identity.principal,
      collection,
      row,
      seed,
      advance: (ms: number) => {
        instant += ms;
      },
    };
  }
  it('processes a real producer event and projection before stopping between claims', async () => {
    const f = await fixture();
    let calls = 0;
    const runner = createOutboxRunner({
      ...f.options(async (received) => {
        calls++;
        await f.projection.apply(received.eventId);
      }),
      wait: async () => {
        f.controller.abort();
      },
    });
    const report = await runner.run(f.controller.signal);
    assert.equal(report.counts.delivered, 1);
    assert.equal(calls, 1);
    assert.equal((await f.row()).state, 'delivered');
    assert.ok(await f.projection.read(f.principal, 'record-a'));
    assert.equal(await f.collection('projection_receipts').countDocuments(), 1);
  });
  it('waits for an in-flight consumer and durable acknowledgment during shutdown', async () => {
    const f = await fixture();
    const entered = gate();
    const release = gate();
    let settled = false;
    const runner = createOutboxRunner(
      f.options(async (_, signal) => {
        entered.release();
        await release.promise;
        assert.equal(signal.aborted, true);
      }),
    );
    const running = runner.run(f.controller.signal).finally(() => {
      settled = true;
    });
    await entered.promise;
    f.controller.abort();
    assert.equal(settled, false);
    assert.equal((await f.row()).state, 'leased');
    release.release();
    const report = await running;
    assert.equal(report.counts.delivered, 1);
    assert.equal((await f.row()).state, 'delivered');
  });
  it('cooperative consumer cancellation schedules retry without another claim', async () => {
    const f = await fixture();
    let calls = 0;
    const runner = createOutboxRunner(
      f.options(async () => {
        calls++;
        f.controller.abort();
        throw Error('Private cancellation details');
      }),
    );
    const report = await runner.run(f.controller.signal);
    assert.equal(report.counts.retry_scheduled, 1);
    assert.equal(calls, 1);
    assert.equal((await f.row()).state, 'pending');
    assert.equal((await f.row()).lastError, 'DELIVERY_FAILED');
    assert.equal(
      JSON.stringify(await f.collection('delivery_audit').find().toArray()).includes('Private'),
      false,
    );
  });
  it('stopping during a pending claim never starts its consumer or marks delivery successful', async () => {
    const f = await fixture();
    const entered = gate();
    const release = gate();
    const runner = createOutboxRunner({
      ...f.options(async () => assert.fail('Cancelled before consumer')),
      worker: {
        runOnce: async (workerId, handle) => {
          entered.release();
          await release.promise;
          return f.worker.runOnce(workerId, handle);
        },
      },
    });
    const running = runner.run(f.controller.signal);
    await entered.promise;
    f.controller.abort();
    release.release();
    const report = await running;
    assert.equal(report.counts.delivered, 0);
    assert.equal(report.counts.retry_scheduled, 1);
    assert.equal((await f.row()).state, 'pending');
  });
  it('an unroutable event follows real retry/exhaustion instead of disappearing', async () => {
    const f = await fixture();
    const runner = createOutboxRunner({
      ...f.options(async () => assert.fail('No route')),
      routes: [],
      wait: async (ms) => {
        f.advance(ms);
        if ((await f.row()).state === 'dead') f.controller.abort();
      },
    });
    const report = await runner.run(f.controller.signal);
    assert.equal(report.counts.unroutable, 2);
    assert.equal(report.counts.dead, 1);
    assert.equal((await f.row()).state, 'dead');
    assert.equal(await f.collection('audit').countDocuments(), 1);
  });
  it('replays a post-projection handler failure without duplicating projection effects', async () => {
    const f = await fixture();
    let calls = 0;
    const runner = createOutboxRunner(
      f.options(async (received) => {
        await f.projection.apply(received.eventId);
        if (++calls === 1) throw Error('Acknowledgment lost');
        f.controller.abort();
      }),
    );
    const report = await runner.run(f.controller.signal);
    assert.equal(calls, 2);
    assert.equal(report.counts.retry_scheduled, 1);
    assert.equal(report.counts.delivered, 1);
    assert.equal(await f.collection('projection_receipts').countDocuments(), 1);
    assert.equal(await f.collection('projection_audit').countDocuments(), 1);
  });
  it('starts a fresh runner after shutdown and leaves unclaimed work available', async () => {
    const f = await fixture();
    await f.seed('record-b');
    let calls = 0;
    const first = createOutboxRunner(
      f.options(async () => {
        calls++;
        f.controller.abort();
      }),
    );
    await first.run(f.controller.signal);
    assert.equal(await f.collection('outbox').countDocuments({ state: 'pending' }), 1);
    const second = new AbortController();
    const next = createOutboxRunner({
      ...f.options(async () => {
        calls++;
        second.abort();
      }),
      workerId: 'fixture-worker-restarted',
    });
    await next.run(second.signal);
    assert.equal(calls, 2);
    assert.equal(await f.collection('outbox').countDocuments({ state: 'delivered' }), 2);
  });
  it('does not hide lease loss when a handler exceeds its configured lease', async () => {
    const f = await fixture();
    const runner = createOutboxRunner(
      f.options(async () => {
        f.advance(100);
        f.controller.abort();
      }),
    );
    const report = await runner.run(f.controller.signal);
    assert.equal(report.counts.lease_lost, 1);
    assert.equal((await f.row()).state, 'leased');
    assert.equal(
      (await f.worker.runOnce('replacement-worker', async () => {})).status,
      'delivered',
    );
  });
});
