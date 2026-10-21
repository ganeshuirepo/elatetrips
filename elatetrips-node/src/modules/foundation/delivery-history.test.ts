import { strict as assert } from 'node:assert';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { mongo } from 'mongoose';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { z } from 'zod';
import { createJsonProtection, canonicalJson, type StorageKeys } from './encrypted-json';
import { authenticateFoundationEvent, type StoredFoundationEvent } from './foundation-event';
import { resolvePrincipal, type VerifiedPrincipal } from './identity';
import { openVersionedStore } from './persistence';
import { openOutboxWorker } from './outbox';
import { openDeliveryRecovery } from './delivery-recovery';
import { openDeliveryHistory, DeliveryHistoryError, type HistoryOptions } from './delivery-history';
import { deliverySchema } from './outbox-record';

const start = '2026-10-21T12:00:00.000Z';
const scope = { kind: 'organization' as const, id: 'fixture-org' };
const secret = 'Private synthetic journal payload';
const failure = async () => {
  throw Error('Private provider failure');
};
const success = async () => {};
function code(expected: string) {
  return (error: unknown) => error instanceof DeliveryHistoryError && error.code === expected;
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
function gate() {
  let release: () => void = () => {
    throw Error('Gate not initialized');
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { release, promise };
}

describe('bounded scoped real Mongo delivery history', () => {
  let replica: MongoMemoryReplSet;
  let client: mongo.MongoClient;
  const database = `history_test_${randomUUID().replace(/-/g, '')}`;
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
    const namespace = `h_${randomUUID().replace(/-/g, '')}`;
    const keys: StorageKeys = {
      activeKeyId: 'fixture-key',
      encryptionKeys: new Map([['fixture-key', randomBytes(32)]]),
      fingerprintKey: randomBytes(32),
    };
    let instant = Date.parse(start);
    let active = true;
    let denied = '';
    let operatorScope: { kind: 'customer' | 'organization' | 'partner'; id: string } = scope;
    let role = 'ops';
    let membershipFailure = false;
    let permissionFailure = false;
    const user = await principal('source-user');
    const operator = await principal('ops-user');
    const common = {
      client,
      database,
      namespace,
      keys,
      clock: () => new Date(instant).toISOString(),
      memberships: {
        listForUser: async (userId: string) => {
          if (membershipFailure) throw Error('Private directory exception');
          return [
            {
              membershipId: `member-${userId}`,
              userId,
              scope: userId === 'ops-user' ? operatorScope : scope,
              role: userId === 'ops-user' ? role : 'organizer',
              active: userId === 'ops-user' ? active : true,
              validFrom: null,
              expiresAt: null,
            },
          ];
        },
      },
      loadPolicy: async () => {
        if (permissionFailure) throw Error('Private permission exception');
        return {
          policyId: 'fixture-permissions',
          revision: 1,
          grants: [
            { action: 'context.write', roles: ['organizer'] },
            { action: 'context.read', roles: ['organizer'] },
            { action: 'delivery.retry', roles: ['ops'] },
            { action: 'delivery.history.read', roles: ['ops'] },
            { action: 'delivery.history.details', roles: ['ops'] },
          ].filter((grant) => grant.action !== denied),
        };
      },
    };
    const store = await openVersionedStore({
      ...common,
      kind: 'fixture-record',
      schemaVersion: 'fixture-v1',
      schema: z.object({ note: z.string() }).strict(),
      mode: 'mutable',
      readAction: 'context.read',
      writeAction: 'context.write',
    });
    const write = () =>
      store.write(user, {
        id: 'fixture-record',
        commandId: 'fixture-create',
        correlationId: 'fixture-flow',
        createScope: scope,
        expectedRevision: 0,
        payload: { note: secret },
      });
    const eventId = (await write()).eventId;
    const workerOptions = {
      ...common,
      policy: {
        policyId: 'fixture-delivery',
        revision: 1,
        leaseDurationMs: 100,
        maxAttempts: 1,
        retryDelaysMs: [],
      },
      renewal: { policyId: 'fixture-renewal', revision: 1, maxExtensions: 3, maxLifetimeMs: 300 },
    };
    const worker = await openOutboxWorker(workerOptions);
    const recovery = await openDeliveryRecovery({
      ...common,
      policy: {
        policyId: 'fixture-recovery',
        revision: 1,
        retryEnabled: true,
        maxRecoveriesPerEvent: 2,
        retryDelayMs: 0,
        reasonCodes: ['fixture_resolved'],
      },
    });
    const options: HistoryOptions = {
      ...common,
      policy: { policyId: 'fixture-history', revision: 1, maxPageSize: 2 },
    };
    const history = await openDeliveryHistory(options);
    const collection = (suffix: string) =>
      client.db(database).collection<mongo.Document & { _id: string }>(`${namespace}_${suffix}`);
    const events = client.db(database).collection<StoredFoundationEvent>(`${namespace}_audit`);
    const row = async () => deliverySchema.parse(await collection('outbox').findOne({}));
    const read = (cursor?: string, includeDetails = false, limit = 2) =>
      history.read(operator, {
        eventId,
        limit,
        includeDetails,
        ...(cursor === undefined ? {} : { cursor }),
      });
    const dead = async () => {
      assert.equal((await worker.runOnce('fixture-worker', failure)).status, 'dead');
    };
    const retry = async () =>
      recovery.retry(operator, {
        commandId: `retry-${(await row()).version}`,
        eventId,
        expectedVersion: (await row()).version,
        reasonCode: 'fixture_resolved',
      });
    const advance = (ms: number) => {
      instant += ms;
    };
    const cycle = async () => {
      await dead();
      await retry();
      let renewal;
      const delivered = await worker.runOnce('second-worker', async (_message, control) => {
        advance(20);
        renewal = await control?.renewLease();
      });
      // Assertions deliberately outside the consumer catch boundary.
      assert.deepEqual(renewal, { status: 'renewed', leaseUntil: '2026-10-21T12:00:00.120Z' });
      assert.equal(delivered.status, 'delivered');
    };
    return {
      common,
      options,
      history,
      worker,
      workerOptions,
      user,
      operator,
      eventId,
      collection,
      events,
      row,
      read,
      dead,
      retry,
      advance,
      cycle,
      revoke: () => {
        active = false;
      },
      deny: (value: string) => {
        denied = value;
      },
      setScope: (value: typeof operatorScope) => {
        operatorScope = value;
      },
      setRole: (value: string) => {
        role = value;
      },
      directoryDown: () => {
        membershipFailure = true;
      },
      policyDown: () => {
        permissionFailure = true;
      },
    };
  }

  it('returns an empty version-zero page without creating or changing data', async () => {
    const f = await fixture();
    const before = await client.db(database).listCollections().toArray();
    const queue = await f.row();
    assert.deepEqual(await f.read(), {
      eventId: f.eventId,
      watermarkVersion: 0,
      entries: [],
      nextCursor: null,
    });
    assert.deepEqual(await f.row(), queue);
    assert.deepEqual(await client.db(database).listCollections().toArray(), before);
    assert.equal(await f.collection('delivery_audit').countDocuments(), 0);
  });

  it('pages producer, failure, operator retry, renewal and success with authorized metadata', async () => {
    const f = await fixture();
    await f.cycle();
    const rows = [];
    let cursor: string | undefined;
    do {
      const page = await f.read(cursor, true);
      assert.ok(page);
      assert.equal(page.watermarkVersion, 6);
      assert.ok(page.entries.length <= 2);
      rows.push(...page.entries);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.deepEqual(
      rows.map((row) => row.reason),
      ['claimed', 'attempts_exhausted', 'operator_retry', 'claimed', 'lease_renewed', 'delivered'],
    );
    assert.deepEqual(
      rows.map((row) => row.version),
      [1, 2, 3, 4, 5, 6],
    );
    assert.equal(rows[2]?.details?.actor, 'ops-user');
    assert.equal(rows[2]?.details?.reasonCode, 'fixture_resolved');
    assert.equal(rows[4]?.details?.renewalPolicyId, 'fixture-renewal');
    assert.equal(rows[5]?.after.totalAttempts, 2);
  });

  it('omits source content, worker identity, policies and operator reasons from basic pages', async () => {
    const f = await fixture();
    await f.cycle();
    const page = await f.read();
    assert.ok(page);
    const body = JSON.stringify(page);
    for (const text of [
      secret,
      'fixture-worker',
      'ops-user',
      'fixture-history',
      'fixture-delivery',
      'fixture_resolved',
      'leaseToken',
      'workerId',
      'details',
      'Private provider',
    ])
      assert.equal(body.includes(text), false, text);
    assert.ok(page.nextCursor);
    const encrypted = Buffer.from(page.nextCursor, 'base64url').toString('utf8');
    assert.equal(encrypted.includes('fixture-worker'), false);
  });

  it('keeps the initial watermark while later transitions commit between pages', async () => {
    const f = await fixture();
    await f.dead();
    const first = await f.read(undefined, false, 1);
    assert.ok(first?.nextCursor);
    await f.retry();
    assert.equal((await f.worker.runOnce('later-worker', success)).status, 'delivered');
    const second = await f.read(first.nextCursor, false, 2);
    assert.ok(second);
    assert.equal(second.watermarkVersion, 2);
    assert.deepEqual(
      second.entries.map((row) => row.version),
      [2],
    );
    assert.equal(second.nextCursor, null);
    assert.equal((await f.read())?.watermarkVersion, 5);
  });

  it('allows a smaller page size on continuation without changing the watermark', async () => {
    const f = await fixture();
    await f.cycle();
    const first = await f.read();
    assert.ok(first?.nextCursor);
    const next = await f.read(first.nextCursor, false, 1);
    assert.deepEqual(
      next?.entries.map((row) => row.version),
      [3],
    );
    assert.equal(next?.watermarkVersion, 6);
  });

  it('requires a separate explicit permission for journal details', async () => {
    const f = await fixture();
    await f.dead();
    f.deny('delivery.history.details');
    assert.ok(await f.read());
    await assert.rejects(f.read(undefined, true), code('AUTH_SCOPE_DENIED'));
  });

  it('denies history when only legacy inspection and retry grants are present', async () => {
    const f = await fixture();
    f.deny('delivery.history.read');
    await assert.rejects(f.read(), code('AUTH_SCOPE_DENIED'));
  });

  it('rechecks membership on every continuation and rejects revocation', async () => {
    const f = await fixture();
    await f.cycle();
    const first = await f.read();
    assert.ok(first?.nextCursor);
    f.revoke();
    await assert.rejects(f.read(first.nextCursor), code('AUTH_SCOPE_DENIED'));
  });

  it('rechecks detailed permission on every continuation', async () => {
    const f = await fixture();
    await f.cycle();
    const first = await f.read(undefined, true);
    assert.ok(first?.nextCursor);
    f.deny('delivery.history.details');
    await assert.rejects(f.read(first.nextCursor, true), code('AUTH_SCOPE_DENIED'));
  });

  for (const badScope of [
    { kind: 'organization' as const, id: 'other' },
    { kind: 'partner' as const, id: 'fixture-org' },
    { kind: 'customer' as const, id: 'ops-user' },
  ]) {
    it(`denies cross-scope ${badScope.kind} membership`, async () => {
      const f = await fixture();
      f.setScope(badScope);
      await assert.rejects(f.read(), code('AUTH_SCOPE_DENIED'));
    });
  }

  it('rejects forged principals and ungranted admin roles', async () => {
    const f = await fixture();
    await assert.rejects(
      f.history.read(JSON.parse(JSON.stringify(f.operator)) as VerifiedPrincipal, {
        eventId: f.eventId,
        limit: 1,
        includeDetails: false,
      }),
      code('AUTH_SCOPE_DENIED'),
    );
    f.setRole('admin');
    await assert.rejects(f.read(), code('AUTH_SCOPE_DENIED'));
  });

  it('redacts membership and policy service exceptions', async () => {
    const first = await fixture();
    first.directoryDown();
    await assert.rejects(first.read(), code('IDENTITY_UNAVAILABLE'));
    const second = await fixture();
    second.policyDown();
    await assert.rejects(second.read(), code('IDENTITY_UNAVAILABLE'));
  });

  it('returns null only when both source and queue are missing', async () => {
    const f = await fixture();
    assert.equal(
      await f.history.read(f.operator, { eventId: 'missing', limit: 1, includeDetails: false }),
      null,
    );
    await f.events.deleteMany({});
    await assert.rejects(f.read(), code('EVENT_INVALID'));
  });

  it('authenticates source before inspecting queue or journal', async () => {
    const f = await fixture();
    await f.dead();
    await f.events.updateOne(
      { _id: f.eventId },
      { $set: { 'body.tag': '00000000000000000000000000000000' } },
    );
    await f.collection('delivery_audit').deleteMany({});
    await assert.rejects(f.read(), code('EVENT_INVALID'));
  });

  it('denies unauthorized readers before exposing journal corruption', async () => {
    const f = await fixture();
    await f.dead();
    await f.collection('delivery_audit').deleteMany({});
    f.deny('delivery.history.read');
    await assert.rejects(f.read(), code('AUTH_SCOPE_DENIED'));
  });

  it('rejects a missing queue for an authenticated source', async () => {
    const f = await fixture();
    await f.collection('outbox').deleteMany({});
    await assert.rejects(f.read(), code('INTEGRITY_FAILURE'));
  });

  it('rejects missing intermediate journal rows without skipping a version', async () => {
    const f = await fixture();
    await f.cycle();
    await f.collection('delivery_audit').deleteOne({ version: 2 });
    await assert.rejects(f.read(), code('INTEGRITY_FAILURE'));
  });

  it('rejects missing latest journal anchors', async () => {
    const f = await fixture();
    await f.dead();
    await f.collection('delivery_audit').deleteOne({ version: 2 });
    await assert.rejects(f.read(), code('INTEGRITY_FAILURE'));
  });

  it('rejects page before/after chain changes', async () => {
    const f = await fixture();
    await f.dead();
    await f.collection('delivery_audit').updateOne(
      { version: 2 },
      {
        $set: {
          'before.availableAt': new Date(Date.parse(start) + 1),
          'after.availableAt': new Date(Date.parse(start) + 1),
        },
      },
    );
    await f
      .collection('outbox')
      .updateOne({}, { $set: { availableAt: new Date(Date.parse(start) + 1) } });
    await assert.rejects(f.read(), code('INTEGRITY_FAILURE'));
  });

  it('rejects a queue snapshot that disagrees with its latest journal anchor', async () => {
    const f = await fixture();
    await f.dead();
    await f.collection('outbox').updateOne({}, { $set: { lastError: 'LEASE_EXPIRED' } });
    await assert.rejects(f.read(), code('INTEGRITY_FAILURE'));
  });

  for (const version of [0, 9]) {
    it(`rejects extraneous journal version ${version}`, async () => {
      const f = await fixture();
      await f.dead();
      const source = await f.collection('delivery_audit').findOne({ version: 1 });
      assert.ok(source);
      await f
        .collection('delivery_audit')
        .insertOne({ ...source, _id: `extra-${version}`, version });
      await assert.rejects(f.read(), code('INTEGRITY_FAILURE'));
    });
  }

  it('strictly rejects private fields injected into journal snapshots', async () => {
    const f = await fixture();
    await f.dead();
    await f
      .collection('delivery_audit')
      .updateOne({ version: 1 }, { $set: { 'after.leaseToken': 'private-token' } });
    await assert.rejects(f.read(), code('INTEGRITY_FAILURE'));
  });

  it('rejects changed event IDs, counters, reasons and invalid dates', async () => {
    for (const update of [
      { eventId: 'other' },
      { 'after.totalAttempts': 2 },
      { reason: 'invented' },
      { ts: 'not-a-date' },
    ]) {
      const f = await fixture();
      await f.dead();
      await f.collection('delivery_audit').updateOne({ version: 1 }, { $set: update });
      await assert.rejects(f.read(), code('INTEGRITY_FAILURE'));
    }
  });

  it('rejects pending version-zero queue corruption', async () => {
    const f = await fixture();
    await f
      .collection('outbox')
      .updateOne({}, { $set: { availableAt: new Date(Date.parse(start) + 1) } });
    await assert.rejects(f.read(), code('INTEGRITY_FAILURE'));
  });

  it('rejects cursor mutation, another user, details changes, event changes and policy changes', async () => {
    const f = await fixture();
    await f.cycle();
    const first = await f.read();
    assert.ok(first?.nextCursor);
    const cursor = first.nextCursor;
    await assert.rejects(f.read(`${cursor.slice(0, -3)}AAA`), code('INVALID_CURSOR'));
    await assert.rejects(f.read(cursor, true), code('INVALID_CURSOR'));
    const changed = await openDeliveryHistory({
      ...f.options,
      policy: { ...f.options.policy, revision: 2 },
    });
    await assert.rejects(
      changed.read(f.operator, { eventId: f.eventId, limit: 2, includeDetails: false, cursor }),
      code('INVALID_CURSOR'),
    );
    const nextUser = await principal('different-ops');
    const permissive = await openDeliveryHistory({
      ...f.options,
      memberships: {
        listForUser: async (userId) => [
          {
            membershipId: 'fixture-other',
            userId,
            role: 'ops',
            scope,
            active: true,
            validFrom: null,
            expiresAt: null,
          },
        ],
      },
    });
    await assert.rejects(
      permissive.read(nextUser, { eventId: f.eventId, limit: 2, includeDetails: false, cursor }),
      code('INVALID_CURSOR'),
    );
    const second = await fixture();
    // Same policy/key/database/namespace but a different authenticated event.
    const store = await openVersionedStore({
      ...f.common,
      kind: 'fixture-record',
      schemaVersion: 'fixture-v1',
      schema: z.object({ note: z.string() }).strict(),
      mode: 'mutable',
      readAction: 'context.read',
      writeAction: 'context.write',
    });
    const other = await store.write(f.user, {
      id: second.eventId,
      commandId: 'other',
      correlationId: 'other',
      createScope: scope,
      expectedRevision: 0,
      payload: { note: secret },
    });
    await assert.rejects(
      f.history.read(f.operator, {
        eventId: other.eventId,
        limit: 2,
        includeDetails: false,
        cursor,
      }),
      code('INVALID_CURSOR'),
    );
  });

  it('rejects a continuation if the authenticated source intent changes', async () => {
    const f = await fixture();
    await f.cycle();
    const first = await f.read();
    assert.ok(first?.nextCursor);
    const stored = await f.events.findOne({ _id: f.eventId });
    assert.ok(stored);
    const protection = createJsonProtection(f.common.keys);
    const event = authenticateFoundationEvent(stored, protection, {
      database,
      namespace: f.common.namespace,
      eventId: f.eventId,
    });
    const metadata = {
      database,
      namespace: f.common.namespace,
      eventId: f.eventId,
      aggregate: stored.aggregateId,
      revision: stored.revision,
    };
    // Test-only trusted backup manipulation with fixture keys; not a repair capability.
    await f.events.updateOne(
      { _id: f.eventId },
      {
        $set: {
          body: protection.seal({ ...event, correlationId: 'changed' }, canonicalJson(metadata)),
        },
      },
    );
    await assert.rejects(f.read(first.nextCursor), code('INVALID_CURSOR'));
  });

  it('detects watermark and prior-page anchor changes on continuation', async () => {
    for (const version of [2, 6]) {
      const f = await fixture();
      await f.cycle();
      const first = await f.read();
      assert.ok(first?.nextCursor);
      await f.collection('delivery_audit').deleteOne({ version });
      await assert.rejects(f.read(first.nextCursor), code('INTEGRITY_FAILURE'));
    }
  });

  it('requires both distinct continuation anchors even when journal uniqueness was removed', async () => {
    const f = await fixture();
    await f.dead();
    await f.retry();
    const entered = gate();
    const release = gate();
    const renewals: unknown[] = [];
    const running = f.worker.runOnce('fixture-worker', async (_message, control) => {
      for (let i = 0; i < 3; i++) {
        f.advance(20);
        renewals.push(await control?.renewLease());
      }
      entered.release();
      await release.promise;
    });
    await entered.promise;
    const first = await f.read();
    release.release();
    assert.equal((await running).status, 'delivered');
    assert.equal(renewals.length, 3);
    assert.ok(
      renewals.every(
        (result) =>
          typeof result === 'object' &&
          result !== null &&
          'status' in result &&
          result.status === 'renewed',
      ),
    );
    assert.ok(first?.nextCursor);
    assert.equal(first.watermarkVersion, 7);
    const prior = await f.collection('delivery_audit').findOne({ version: 2 });
    assert.ok(prior);
    await f.collection('delivery_audit').dropIndex('eventId_1_version_1');
    await f.collection('delivery_audit').deleteOne({ version: 7 });
    await f.collection('delivery_audit').insertOne({ ...prior, _id: 'duplicate-anchor' });
    await assert.rejects(f.read(first.nextCursor), code('INTEGRITY_FAILURE'));
  });

  it('rejects noncanonical cursor trailing bits that decode to identical bytes', async () => {
    const f = await fixture();
    await f.dead();
    let history = f.history;
    const request = { eventId: f.eventId, limit: 1, includeDetails: false };
    let first = await history.read(f.operator, request);
    for (let i = 1; first?.nextCursor && first.nextCursor.length % 4 === 0 && i < 4; i++) {
      history = await openDeliveryHistory({
        ...f.options,
        policy: { ...f.options.policy, policyId: `fixture-history${'x'.repeat(i)}` },
      });
      first = await history.read(f.operator, request);
    }
    assert.ok(first?.nextCursor);
    assert.notEqual(first.nextCursor.length % 4, 0);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const index = alphabet.indexOf(first.nextCursor.slice(-1));
    const alternative = `${first.nextCursor.slice(0, -1)}${alphabet[index + 1]}`;
    assert.deepEqual(
      Buffer.from(alternative, 'base64url'),
      Buffer.from(first.nextCursor, 'base64url'),
    );
    await assert.rejects(
      history.read(f.operator, { ...request, cursor: alternative }),
      code('INVALID_CURSOR'),
    );
  });

  it('rejects queue rollback beneath the continuation watermark', async () => {
    const f = await fixture();
    await f.cycle();
    const first = await f.read();
    assert.ok(first?.nextCursor);
    const prior = await f.collection('delivery_audit').findOne({ version: 2 });
    assert.ok(prior);
    await f.collection('outbox').replaceOne({}, { ...prior.after, leaseToken: null });
    await f.collection('delivery_audit').deleteMany({ version: { $gt: 2 } });
    await assert.rejects(f.read(first.nextCursor), code('INTEGRITY_FAILURE'));
  });

  it('supports reclaimed and final expired leases with their structural transitions', async () => {
    const f = await fixture();
    const worker = await openOutboxWorker({
      ...f.workerOptions,
      policy: { ...f.workerOptions.policy, maxAttempts: 2, retryDelaysMs: [0] },
    });
    const entered = gate();
    const release = gate();
    const old = worker.runOnce('old-worker', async () => {
      entered.release();
      await release.promise;
    });
    await entered.promise;
    f.advance(100);
    const entered2 = gate();
    const release2 = gate();
    const newer = worker.runOnce('new-worker', async () => {
      entered2.release();
      await release2.promise;
    });
    await entered2.promise;
    f.advance(100);
    const expired = await worker.runOnce('expiry-worker', success);
    release2.release();
    release.release();
    assert.equal((await old).status, 'lease_lost');
    assert.equal((await newer).status, 'lease_lost');
    assert.equal(expired.status, 'dead');
    const first = await f.read();
    assert.ok(first?.nextCursor);
    const second = await f.read(first.nextCursor);
    assert.deepEqual(
      [...first.entries, ...(second?.entries ?? [])].map((row) => row.reason),
      ['claimed', 'reclaimed', 'attempts_exhausted'],
    );
  });

  it('supports scheduled failure retries', async () => {
    const f = await fixture();
    const worker = await openOutboxWorker({
      ...f.workerOptions,
      policy: { ...f.workerOptions.policy, maxAttempts: 2, retryDelaysMs: [10] },
    });
    assert.equal((await worker.runOnce('fixture-worker', failure)).status, 'retry_scheduled');
    assert.deepEqual(
      (await f.read())?.entries.map((row) => row.reason),
      ['claimed', 'retry_scheduled'],
    );
  });

  it('reads invalid-event quarantine history after the original source is restored', async () => {
    const f = await fixture();
    const original = await f.events.findOne({ _id: f.eventId });
    assert.ok(original);
    await f.events.updateOne(
      { _id: f.eventId },
      { $set: { 'body.tag': '00000000000000000000000000000000' } },
    );
    let calls = 0;
    const result = await f.worker.runOnce('fixture-worker', async () => {
      calls += 1;
    });
    assert.equal(result.status, 'dead');
    assert.equal(calls, 0);
    await f.events.replaceOne({ _id: f.eventId }, original);
    assert.deepEqual(
      (await f.read())?.entries.map((row) => row.reason),
      ['claimed', 'invalid_event'],
    );
  });

  it('keeps source, queue and journal anchors in one snapshot during a concurrent worker commit', async () => {
    const f = await fixture();
    const entered = gate();
    const release = gate();
    const history = await openDeliveryHistory({
      ...f.options,
      memberships: {
        listForUser: async (userId) => {
          entered.release();
          await release.promise;
          return f.options.memberships.listForUser(userId);
        },
      },
    });
    const reading = history.read(f.operator, {
      eventId: f.eventId,
      limit: 2,
      includeDetails: false,
    });
    await entered.promise;
    const result = await f.worker.runOnce('concurrent-worker', success);
    release.release();
    assert.equal(result.status, 'delivered');
    assert.deepEqual(await reading, {
      eventId: f.eventId,
      watermarkVersion: 0,
      entries: [],
      nextCursor: null,
    });
    assert.equal((await f.read())?.watermarkVersion, 2);
  });

  it('validates request bounds, booleans and unknown fields before opening a session', async () => {
    const f = await fixture();
    for (const override of [
      { limit: 0 },
      { limit: 3 },
      { limit: 1.5 },
      { eventId: '' },
      { includeDetails: 'true' },
      { scope },
      { cursor: '' },
    ]) {
      await assert.rejects(
        f.history.read(f.operator, {
          eventId: f.eventId,
          limit: 1,
          includeDetails: false,
          ...override,
        } as never),
        code('INVALID_REQUEST'),
      );
    }
  });

  it('rejects invalid policies, namespaces, database names and keys', async () => {
    const f = await fixture();
    for (const override of [
      { policy: { ...f.options.policy, maxPageSize: 0 } },
      { policy: { ...f.options.policy, maxPageSize: 2_147_483_647 } },
      { policy: { ...f.options.policy, revision: 0 } },
      { policy: { ...f.options.policy, extra: true } },
      { namespace: '../bad' },
      { database: 'bad/name' },
      { keys: { ...f.options.keys, fingerprintKey: Buffer.alloc(0) } },
    ]) {
      await assert.rejects(
        openDeliveryHistory({ ...f.options, ...override }),
        code('INVALID_CONFIGURATION'),
      );
    }
  });

  it('redacts invalid permission configuration and clocks', async () => {
    const f = await fixture();
    const invalidPolicy = await openDeliveryHistory({ ...f.options, loadPolicy: async () => ({}) });
    await assert.rejects(
      invalidPolicy.read(f.operator, { eventId: f.eventId, limit: 1, includeDetails: false }),
      code('POLICY_INVALID'),
    );
    const invalidClock = await openDeliveryHistory({
      ...f.options,
      clock: () => 'private-invalid-clock',
    });
    await assert.rejects(
      invalidClock.read(f.operator, { eventId: f.eventId, limit: 1, includeDetails: false }),
      code('INVALID_REQUEST'),
    );
  });

  it('continues cursors after reconnect and retained-key rotation without writes', async () => {
    const f = await fixture();
    await f.cycle();
    const first = await f.read();
    assert.ok(first?.nextCursor);
    const reopened = await new mongo.MongoClient(replica.getUri()).connect();
    try {
      const keys = {
        ...f.options.keys,
        activeKeyId: 'new-key',
        encryptionKeys: new Map([...f.options.keys.encryptionKeys, ['new-key', randomBytes(32)]]),
      };
      const history = await openDeliveryHistory({ ...f.options, client: reopened, keys });
      const queue = await f.row();
      const journal = await f.collection('delivery_audit').find().toArray();
      const page = await history.read(f.operator, {
        eventId: f.eventId,
        cursor: first.nextCursor,
        limit: 2,
        includeDetails: false,
      });
      assert.deepEqual(
        page?.entries.map((row) => row.version),
        [3, 4],
      );
      assert.deepEqual(await f.row(), queue);
      assert.deepEqual(await f.collection('delivery_audit').find().toArray(), journal);
    } finally {
      await reopened.close();
    }
  });

  it('rejects standalone deployments without creating collections', async () => {
    const f = await fixture();
    const standalone = await MongoMemoryServer.create();
    const connection = await new mongo.MongoClient(standalone.getUri()).connect();
    try {
      await assert.rejects(
        openDeliveryHistory({ ...f.options, client: connection }),
        code('TRANSACTIONS_REQUIRED'),
      );
      assert.equal((await connection.db(database).listCollections().toArray()).length, 0);
    } finally {
      await connection.close();
      await standalone.stop();
    }
  });
});
