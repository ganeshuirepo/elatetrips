import { strict as assert } from 'node:assert';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { mongo } from 'mongoose';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { z } from 'zod';
import { canonicalJson, createJsonProtection, type StorageKeys } from './encrypted-json';
import {
  authenticateFoundationEvent,
  type FoundationEvent,
  type StoredFoundationEvent,
} from './foundation-event';
import { resolvePrincipal, type VerifiedPrincipal } from './identity';
import { openVersionedStore } from './persistence';
import { openOutboxWorker, OutboxError, type OutboxMessage } from './outbox';
import { openSnapshotProjection, ProjectionError, type ProjectionOptions } from './projection';

const schema = z.object({ note: z.string(), count: z.number().int().nonnegative() }).strict();
type Payload = z.infer<typeof schema>;
const payload = { note: 'Private synthetic projection content', count: 1 };
const sourceTime = '2026-10-21T12:00:00.000Z';
const receiveTime = '2026-10-21T12:00:01.000Z';
function code(expected: string) {
  return (error: unknown) => error instanceof ProjectionError && error.code === expected;
}

describe('real Mongo replay-safe snapshot projection', () => {
  let replica: MongoMemoryReplSet;
  let client: mongo.MongoClient;
  const database = `projection_test_${randomUUID().replace(/-/g, '')}`;
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
    const namespace = `p_${randomUUID().replace(/-/g, '')}`;
    const keys: StorageKeys = {
      activeKeyId: 'fixture-key',
      encryptionKeys: new Map([['fixture-key', randomBytes(32)]]),
      fingerprintKey: randomBytes(32),
    };
    const protection = createJsonProtection(keys);
    const scope = { kind: 'organization' as const, id: 'fixture-org-a' };
    const result = await resolvePrincipal(
      'fixture',
      { sign: () => '', verify: () => ({ phone: 'fixture' }) },
      {
        findByTokenIdentifier: async () => ({ userId: 'fixture-user', active: true }),
      },
    );
    if (result.status !== 'authenticated') throw Error('Fixture identity failed');
    const user = result.principal;
    let active = true;
    let sourceClock = sourceTime;
    let receiveClock = Date.parse(receiveTime);
    const common = {
      client,
      database,
      namespace,
      keys,
      kind: 'fixture-context',
      schemaVersion: 'fixture-v1',
      schema,
      memberships: {
        listForUser: async (userId: string) => [
          {
            membershipId: 'fixture-membership',
            userId,
            scope,
            role: 'organizer',
            active,
            validFrom: null,
            expiresAt: null,
          },
        ],
      },
      loadPolicy: async () => ({
        policyId: 'fixture-access',
        revision: 1,
        grants: [
          { action: 'context.read', roles: ['organizer'] },
          { action: 'context.write', roles: ['organizer'] },
        ],
      }),
    };
    const source = await openVersionedStore({
      ...common,
      mode: 'mutable',
      clock: () => sourceClock,
      readAction: 'context.read',
      writeAction: 'context.write',
    });
    const options: ProjectionOptions<Payload> = {
      ...common,
      projectionId: 'fixture-mirror',
      readAction: 'context.read',
      clock: () => new Date(receiveClock).toISOString(),
    };
    const projection = await openSnapshotProjection(options);
    const collection = (suffix: string) => client.db(database).collection(`${namespace}_${suffix}`);
    const events = client.db(database).collection<StoredFoundationEvent>(`${namespace}_audit`);
    const write = async (revision: number) => {
      sourceClock = new Date(Date.parse(sourceTime) + (revision - 1) * 20).toISOString();
      return source.write(user, {
        id: 'source-a',
        commandId: `command-${revision}`,
        correlationId: 'fixture-flow',
        expectedRevision: revision - 1,
        createScope: scope,
        payload: { ...payload, count: revision },
      });
    };
    const counts = () =>
      Promise.all(
        ['projection_records', 'projection_receipts', 'projection_audit'].map((suffix) =>
          collection(suffix).countDocuments(),
        ),
      );
    const event = async (eventId: string) =>
      authenticateFoundationEvent(await events.findOne({ _id: eventId }), protection, {
        database,
        namespace,
        eventId,
      });
    const rewrite = async (
      eventId: string,
      change: (event: FoundationEvent) => FoundationEvent,
    ) => {
      const updated = change(await event(eventId));
      const binding = canonicalJson({
        database,
        namespace,
        eventId: updated.event_id,
        aggregate: updated.aggregateId,
        revision: updated.revision,
      });
      await events.deleteOne({ _id: eventId });
      await events.insertOne({
        _id: updated.event_id,
        aggregateId: updated.aggregateId,
        revision: updated.revision,
        body: protection.seal(updated, binding),
      });
      return updated.event_id;
    };
    const message = async (eventId: string): Promise<OutboxMessage> => ({
      eventId,
      occurredAt: sourceTime,
      receivedAt: receiveTime,
      event: await event(eventId),
    });
    const validateCollection = async (suffix: string, validator: Record<string, unknown>) =>
      client.db(database).command({
        collMod: `${namespace}_${suffix}`,
        validator,
        validationLevel: 'strict',
      });
    return {
      projection,
      options,
      source,
      user,
      write,
      counts,
      event,
      rewrite,
      message,
      collection,
      events,
      validateCollection,
      protection,
      revoke: () => {
        active = false;
      },
      advance: (ms: number) => {
        receiveClock += ms;
      },
    };
  }

  it('commits encrypted derived state, consumer receipt and immutable audit together', async () => {
    const f = await fixture();
    const first = await f.write(1);
    assert.equal((await f.projection.apply(first.eventId)).status, 'applied');
    assert.deepEqual(await f.projection.read(f.user, 'source-a'), {
      revision: 1,
      eventId: first.eventId,
      payload,
      occurredAt: sourceTime,
      receivedAt: receiveTime,
    });
    assert.deepEqual(await f.counts(), [1, 1, 1]);
    for (const suffix of ['projection_records', 'projection_receipts', 'projection_audit']) {
      const raw = await f.collection(suffix).findOne({});
      assert.ok(raw);
      assert.equal(JSON.stringify(raw).includes(payload.note), false);
    }
    const raw = await f.collection('projection_audit').findOne({});
    assert.ok(raw);
    const { body, ...metadata } = raw;
    const audit = f.protection.open(
      body,
      canonicalJson({
        database,
        namespace: f.options.namespace,
        projectionId: f.options.projectionId,
        type: 'audit',
        metadata,
      }),
    );
    assert.deepEqual(audit, {
      actor: 'fixture-mirror',
      role: 'projector',
      kind: 'fixture-context',
      schemaVersion: 'fixture-v1',
      ts: receiveTime,
      occurredAt: sourceTime,
      receivedAt: receiveTime,
      sourceActor: f.user.userId,
      sourceRole: 'organizer',
      scope: { kind: 'organization', id: 'fixture-org-a' },
      before: null,
      after: payload,
    });
  });

  it('does not rewrite receipt time or emit another audit on identical replay', async () => {
    const f = await fixture();
    const first = await f.write(1);
    await f.projection.apply(first.eventId);
    const receipt = await f.collection('projection_receipts').findOne({});
    f.advance(1000);
    assert.deepEqual(await f.projection.apply(first.eventId), {
      status: 'duplicate',
      eventId: first.eventId,
      revision: 1,
    });
    assert.deepEqual(await f.collection('projection_receipts').findOne({}), receipt);
    assert.equal((await f.projection.read(f.user, 'source-a'))?.receivedAt, receiveTime);
    assert.deepEqual(await f.counts(), [1, 1, 1]);
  });

  it('applies the next matching snapshot and preserves source versus receive time', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const second = await f.write(2);
    await f.projection.apply(first.eventId);
    f.advance(50);
    await f.projection.apply(second.eventId);
    const snapshot = await f.projection.read(f.user, 'source-a');
    assert.equal(snapshot?.revision, 2);
    assert.equal(snapshot?.payload.count, 2);
    assert.equal(snapshot?.occurredAt, '2026-10-21T12:00:00.020Z');
    assert.equal(snapshot?.receivedAt, '2026-10-21T12:00:01.050Z');
    assert.deepEqual(await f.counts(), [1, 2, 2]);
  });

  it('keeps newer state when an earlier processed event is replayed', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const second = await f.write(2);
    await f.projection.apply(first.eventId);
    await f.projection.apply(second.eventId);
    assert.equal((await f.projection.apply(first.eventId)).status, 'duplicate');
    assert.equal((await f.projection.read(f.user, 'source-a'))?.revision, 2);
    assert.deepEqual(await f.counts(), [1, 2, 2]);
  });

  it('defers gaps without writing a receipt or advancing the snapshot', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const second = await f.write(2);
    assert.deepEqual(await f.projection.apply(second.eventId), {
      status: 'gap',
      eventId: second.eventId,
      revision: 2,
      expectedRevision: 1,
    });
    assert.deepEqual(await f.counts(), [0, 0, 0]);
    await assert.rejects(
      f.projection.handle(await f.message(second.eventId)),
      code('REVISION_GAP'),
    );
    await f.projection.apply(first.eventId);
    assert.equal((await f.projection.apply(second.eventId)).status, 'applied');
    assert.equal((await f.projection.read(f.user, 'source-a'))?.revision, 2);
  });

  it('recovers a multi-event gap only after each missing revision is applied', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const second = await f.write(2);
    const third = await f.write(3);
    assert.equal((await f.projection.apply(third.eventId)).status, 'gap');
    await f.projection.apply(first.eventId);
    assert.deepEqual(await f.projection.apply(third.eventId), {
      status: 'gap',
      eventId: third.eventId,
      revision: 3,
      expectedRevision: 2,
    });
    await f.projection.apply(second.eventId);
    await f.projection.apply(third.eventId);
    assert.deepEqual(await f.counts(), [1, 3, 3]);
  });

  it('coalesces simultaneous duplicate consumers into one state change', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const other = await openSnapshotProjection(f.options);
    const results = await Promise.all([
      f.projection.apply(first.eventId),
      other.apply(first.eventId),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), ['applied', 'duplicate']);
    assert.deepEqual(await f.counts(), [1, 1, 1]);
  });

  it('cannot skip a revision when adjacent events arrive concurrently', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const second = await f.write(2);
    const results = await Promise.all([
      f.projection.apply(first.eventId),
      f.projection.apply(second.eventId),
    ]);
    assert.equal(results[0].status, 'applied');
    if (results[1].status === 'gap') await f.projection.apply(second.eventId);
    else assert.equal(results[1].status, 'applied');
    assert.equal((await f.projection.read(f.user, 'source-a'))?.revision, 2);
    assert.deepEqual(await f.counts(), [1, 2, 2]);
  });

  it('namespaces independent consumer receipts and snapshots by projection ID', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const other = await openSnapshotProjection({ ...f.options, projectionId: 'another-mirror' });
    await f.projection.apply(first.eventId);
    await other.apply(first.eventId);
    assert.deepEqual(
      await other.read(f.user, 'source-a'),
      await f.projection.read(f.user, 'source-a'),
    );
    assert.deepEqual(await f.counts(), [2, 2, 2]);
  });

  for (const corruption of ['missing', 'ciphertext', 'metadata']) {
    it(`rejects ${corruption} source events without creating projection state`, async () => {
      const f = await fixture();
      const first = await f.write(1);
      if (corruption === 'missing') await f.events.deleteOne({ _id: first.eventId });
      if (corruption === 'ciphertext')
        await f.events.updateOne({ _id: first.eventId }, { $set: { 'body.tag': '00'.repeat(16) } });
      if (corruption === 'metadata')
        await f.events.updateOne({ _id: first.eventId }, { $set: { revision: 2 } });
      await assert.rejects(f.projection.apply(first.eventId), code('EVENT_INVALID'));
      assert.deepEqual(await f.counts(), [0, 0, 0]);
    });
  }

  it('rejects a source kind or schema version outside the configured mirror', async () => {
    const f = await fixture();
    const first = await f.write(1);
    for (const options of [
      { ...f.options, kind: 'other-kind' },
      { ...f.options, schemaVersion: 'fixture-v2' },
    ]) {
      const other = await openSnapshotProjection(options);
      await assert.rejects(other.apply(first.eventId), code('EVENT_UNSUPPORTED'));
    }
    assert.deepEqual(await f.counts(), [0, 0, 0]);
  });

  it('rejects invalid snapshots and validators that alter the canonical payload', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const transformed = await openSnapshotProjection({
      ...f.options,
      schema: schema.transform((value) => ({ ...value, count: value.count + 1 })),
    });
    await assert.rejects(transformed.apply(first.eventId), code('EVENT_INVALID'));
    await f.rewrite(first.eventId, (event) => ({
      ...event,
      after: { ...payload, unexpected: true },
    }));
    await assert.rejects(f.projection.apply(first.eventId), code('EVENT_INVALID'));
    assert.deepEqual(await f.counts(), [0, 0, 0]);
  });

  it('rejects a changed before snapshot instead of overwriting a broken chain', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const second = await f.write(2);
    await f.projection.apply(first.eventId);
    await f.rewrite(second.eventId, (event) => ({ ...event, before: { ...payload, count: 999 } }));
    await assert.rejects(f.projection.apply(second.eventId), code('CHAIN_CONFLICT'));
    assert.equal((await f.projection.read(f.user, 'source-a'))?.revision, 1);
    assert.deepEqual(await f.counts(), [1, 1, 1]);
  });

  it('refuses to move an existing aggregate into another scope', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const second = await f.write(2);
    await f.projection.apply(first.eventId);
    await f.rewrite(second.eventId, (event) => ({
      ...event,
      scope: { kind: 'organization', id: 'other-org' },
    }));
    await assert.rejects(f.projection.apply(second.eventId), code('SCOPE_CONFLICT'));
    assert.deepEqual(await f.counts(), [1, 1, 1]);
  });

  it('rejects changed intent under an already consumed event ID', async () => {
    const f = await fixture();
    const first = await f.write(1);
    await f.projection.apply(first.eventId);
    await f.rewrite(first.eventId, (event) => ({ ...event, after: { ...payload, count: 99 } }));
    await assert.rejects(f.projection.apply(first.eventId), code('EVENT_CONFLICT'));
    assert.deepEqual((await f.projection.read(f.user, 'source-a'))?.payload, payload);
    assert.deepEqual(await f.counts(), [1, 1, 1]);
  });

  it('ignores an authenticated stale event with another ID without regressing newer state', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const second = await f.write(2);
    await f.projection.apply(first.eventId);
    await f.projection.apply(second.eventId);
    const staleId = await f.rewrite(first.eventId, (event) => ({
      ...event,
      event_id: 'alternate-old-event',
    }));
    assert.equal((await f.projection.apply(staleId)).status, 'stale');
    assert.equal((await f.projection.read(f.user, 'source-a'))?.revision, 2);
    assert.deepEqual(await f.counts(), [1, 2, 2]);
  });

  for (const kind of ['customer', 'organization', 'partner'] as const) {
    it(`denies reads from an unrelated ${kind} membership`, async () => {
      const f = await fixture();
      const first = await f.write(1);
      await f.projection.apply(first.eventId);
      const other = await openSnapshotProjection({
        ...f.options,
        memberships: {
          listForUser: async (userId) => [
            {
              membershipId: 'other-member',
              userId,
              role: 'organizer',
              active: true,
              validFrom: null,
              expiresAt: null,
              scope: { kind, id: 'other-scope' },
            },
          ],
        },
      });
      await assert.rejects(other.read(f.user, 'source-a'), code('AUTH_SCOPE_DENIED'));
    });
  }

  it('uses current membership and rejects serialized principals on reads', async () => {
    const f = await fixture();
    const first = await f.write(1);
    await f.projection.apply(first.eventId);
    await assert.rejects(
      f.projection.read(JSON.parse(JSON.stringify(f.user)) as VerifiedPrincipal, 'source-a'),
      code('AUTH_SCOPE_DENIED'),
    );
    f.revoke();
    await assert.rejects(f.projection.read(f.user, 'source-a'), code('AUTH_SCOPE_DENIED'));
  });

  it('fails closed when current read permissions or their storage are unavailable', async () => {
    const f = await fixture();
    const first = await f.write(1);
    await f.projection.apply(first.eventId);
    const empty = await openSnapshotProjection({
      ...f.options,
      loadPolicy: async () => ({ policyId: 'empty', revision: 1, grants: [] }),
    });
    await assert.rejects(empty.read(f.user, 'source-a'), code('AUTH_SCOPE_DENIED'));
    const unavailable = await openSnapshotProjection({
      ...f.options,
      loadPolicy: async () => {
        throw Error('Private failure');
      },
    });
    await assert.rejects(unavailable.read(f.user, 'source-a'), code('IDENTITY_UNAVAILABLE'));
  });

  it('authenticates encrypted current state and receipts before read or replay', async () => {
    const f = await fixture();
    const first = await f.write(1);
    await f.projection.apply(first.eventId);
    await f
      .collection('projection_receipts')
      .updateOne({}, { $set: { 'body.tag': '00'.repeat(16) } });
    await assert.rejects(f.projection.apply(first.eventId), code('INTEGRITY_FAILURE'));
    await f
      .collection('projection_records')
      .updateOne({}, { $set: { 'body.tag': '00'.repeat(16) } });
    await assert.rejects(f.projection.read(f.user, 'source-a'), code('INTEGRITY_FAILURE'));
    await assert.rejects(f.projection.apply(first.eventId), code('INTEGRITY_FAILURE'));
    assert.deepEqual(await f.counts(), [1, 1, 1]);
  });

  it('authenticates persisted ownership before releasing a snapshot to another scope', async () => {
    const f = await fixture();
    const first = await f.write(1);
    await f.projection.apply(first.eventId);
    await f
      .collection('projection_records')
      .updateOne({}, { $set: { scope: { kind: 'organization', id: 'other-org' } } });
    const other = await openSnapshotProjection({
      ...f.options,
      memberships: {
        listForUser: async (userId) => [
          {
            membershipId: 'other-member',
            userId,
            role: 'organizer',
            active: true,
            validFrom: null,
            expiresAt: null,
            scope: { kind: 'organization', id: 'other-org' },
          },
        ],
      },
    });
    await assert.rejects(other.read(f.user, 'source-a'), code('INTEGRITY_FAILURE'));
  });

  for (const suffix of ['projection_records', 'projection_receipts', 'projection_audit']) {
    it(`rolls all projection writes back if ${suffix} rejects its insert`, async () => {
      const f = await fixture();
      const first = await f.write(1);
      await f.validateCollection(suffix, { forcedFailure: { $exists: true } });
      await assert.rejects(f.projection.apply(first.eventId), code('STORAGE_UNAVAILABLE'));
      assert.deepEqual(await f.counts(), [0, 0, 0]);
      assert.equal((await f.source.read(f.user, 'source-a'))?.revision, 1);
    });
  }

  it('preserves the previous snapshot when an update audit insert fails', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const second = await f.write(2);
    await f.projection.apply(first.eventId);
    await f.validateCollection('projection_audit', { forcedFailure: { $exists: true } });
    await assert.rejects(f.projection.apply(second.eventId), code('STORAGE_UNAVAILABLE'));
    assert.equal((await f.projection.read(f.user, 'source-a'))?.revision, 1);
    assert.deepEqual(await f.counts(), [1, 1, 1]);
  });

  it('replays safely through producer/outbox/projection after delivery acknowledgment is lost', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const workerOptions = {
      client,
      database,
      namespace: f.options.namespace,
      keys: f.options.keys,
      clock: f.options.clock,
      policy: {
        policyId: 'fixture-delivery',
        revision: 1,
        leaseDurationMs: 100,
        maxAttempts: 3,
        retryDelaysMs: [10, 10],
      },
    };
    const worker = await openOutboxWorker(workerOptions);
    let calls = 0;
    await assert.rejects(
      worker.runOnce('worker-a', async (message) => {
        calls++;
        await f.projection.handle(message);
        await f.validateCollection('delivery_audit', { reason: { $ne: 'delivered' } });
      }),
      (error: unknown) => error instanceof OutboxError && error.code === 'STORAGE_UNAVAILABLE',
    );
    assert.deepEqual(await f.counts(), [1, 1, 1]);
    assert.equal((await f.projection.read(f.user, 'source-a'))?.eventId, first.eventId);
    await f.validateCollection('delivery_audit', {});
    f.advance(100);
    const connection = await new mongo.MongoClient(replica.getUri()).connect();
    try {
      const recovered = await openOutboxWorker({ ...workerOptions, client: connection });
      const projection = await openSnapshotProjection({ ...f.options, client: connection });
      assert.equal(
        (
          await recovered.runOnce('worker-b', async (message) => {
            calls++;
            await projection.handle(message);
          })
        ).status,
        'delivered',
      );
    } finally {
      await connection.close();
    }
    assert.equal(calls, 2);
    assert.deepEqual(await f.counts(), [1, 1, 1]);
    assert.equal((await f.collection('outbox').findOne({}))?.state, 'delivered');
  });

  it('retries an out-of-order delivery and applies it after the missing event', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const second = await f.write(2);
    await f
      .collection('outbox')
      .updateOne(
        { eventId: first.eventId },
        { $set: { availableAt: new Date(Date.parse(receiveTime) + 100) } },
      );
    const worker = await openOutboxWorker({
      client,
      database,
      namespace: f.options.namespace,
      keys: f.options.keys,
      clock: f.options.clock,
      policy: {
        policyId: 'fixture-delivery',
        revision: 1,
        leaseDurationMs: 100,
        maxAttempts: 3,
        retryDelaysMs: [10, 10],
      },
    });
    assert.equal((await worker.runOnce('worker-a', f.projection.handle)).status, 'retry_scheduled');
    assert.deepEqual(await f.counts(), [0, 0, 0]);
    await f
      .collection('outbox')
      .updateOne({ eventId: first.eventId }, { $set: { availableAt: new Date(receiveTime) } });
    assert.equal((await worker.runOnce('worker-a', f.projection.handle)).status, 'delivered');
    f.advance(10);
    assert.equal((await worker.runOnce('worker-a', f.projection.handle)).status, 'delivered');
    assert.equal((await f.projection.read(f.user, 'source-a'))?.eventId, second.eventId);
    assert.deepEqual(await f.counts(), [1, 2, 2]);
  });

  it('reloads authoritative source content instead of trusting a callback body', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const message = await f.message(first.eventId);
    message.event.after = { note: 'Injected callback content', count: 999 };
    message.occurredAt = 'forged';
    message.receivedAt = 'forged';
    await f.projection.handle(message);
    assert.deepEqual((await f.projection.read(f.user, 'source-a'))?.payload, payload);
    assert.equal((await f.projection.read(f.user, 'source-a'))?.receivedAt, receiveTime);
  });

  it('retains durable state and deduplication after closing and reopening clients', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const original = await new mongo.MongoClient(replica.getUri()).connect();
    try {
      await (await openSnapshotProjection({ ...f.options, client: original })).apply(first.eventId);
    } finally {
      await original.close();
    }
    const replacement = await new mongo.MongoClient(replica.getUri()).connect();
    try {
      const reopened = await openSnapshotProjection({ ...f.options, client: replacement });
      assert.equal((await reopened.apply(first.eventId)).status, 'duplicate');
      assert.deepEqual((await reopened.read(f.user, 'source-a'))?.payload, payload);
    } finally {
      await replacement.close();
    }
    assert.deepEqual(await f.counts(), [1, 1, 1]);
  });

  it('uses retained read keys after rotation without changing consumer fingerprints', async () => {
    const f = await fixture();
    const first = await f.write(1);
    await f.projection.apply(first.eventId);
    const rotated = await openSnapshotProjection({
      ...f.options,
      keys: {
        ...f.options.keys,
        activeKeyId: 'rotated-key',
        encryptionKeys: new Map([
          ...f.options.keys.encryptionKeys,
          ['rotated-key', randomBytes(32)],
        ]),
      },
    });
    assert.equal((await rotated.apply(first.eventId)).status, 'duplicate');
    assert.deepEqual((await rotated.read(f.user, 'source-a'))?.payload, payload);
  });

  it('validates IDs, clock and configuration and returns empty for missing derived records', async () => {
    const f = await fixture();
    const first = await f.write(1);
    assert.equal(await f.projection.read(f.user, 'missing'), null);
    await assert.rejects(f.projection.apply(' '), code('INVALID_REQUEST'));
    const badClock = await openSnapshotProjection({ ...f.options, clock: () => 'invalid' });
    await assert.rejects(badClock.apply(first.eventId), code('INVALID_REQUEST'));
    await assert.rejects(
      openSnapshotProjection({ ...f.options, namespace: '../other' }),
      code('INVALID_CONFIGURATION'),
    );
    assert.deepEqual(await f.counts(), [0, 0, 0]);
  });

  it('reports closed storage through the fixed error boundary', async () => {
    const f = await fixture();
    const first = await f.write(1);
    const connection = await new mongo.MongoClient(replica.getUri()).connect();
    const projection = await openSnapshotProjection({ ...f.options, client: connection });
    await connection.close();
    await assert.rejects(projection.apply(first.eventId), code('STORAGE_UNAVAILABLE'));
    await assert.rejects(projection.read(f.user, 'source-a'), code('STORAGE_UNAVAILABLE'));
  });

  it('protects consumer receipts and per-revision audit with unique indexes', async () => {
    const f = await fixture();
    const first = await f.write(1);
    await f.projection.apply(first.eventId);
    for (const suffix of ['projection_receipts', 'projection_audit']) {
      const entry = await f.collection(suffix).findOne({});
      assert.ok(entry);
      await assert.rejects(
        f.collection(suffix).insertOne({ ...entry, _id: new mongo.ObjectId() }),
        (error: unknown) => error instanceof mongo.MongoServerError && error.code === 11000,
      );
    }
  });

  it('rejects standalone Mongo before creating derived collections', async () => {
    const f = await fixture();
    const standalone = await MongoMemoryServer.create();
    const connection = await new mongo.MongoClient(standalone.getUri()).connect();
    try {
      await assert.rejects(
        openSnapshotProjection({ ...f.options, client: connection }),
        code('TRANSACTIONS_REQUIRED'),
      );
      assert.equal((await connection.db(database).listCollections().toArray()).length, 0);
    } finally {
      await connection.close();
      await standalone.stop();
    }
  });
});
