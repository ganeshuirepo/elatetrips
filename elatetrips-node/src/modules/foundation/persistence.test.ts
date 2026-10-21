import { strict as assert } from 'node:assert';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { mongo } from 'mongoose';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { z } from 'zod';
import { resolvePrincipal, type VerifiedPrincipal } from './identity';
import { canonicalJson, createJsonProtection, type StorageKeys } from './encrypted-json';
import { FoundationStoreError, openVersionedStore, type StoreOptions } from './persistence';

const schema = z.object({ note: z.string(), count: z.number().int().nonnegative() }).strict();
type Payload = z.infer<typeof schema>;
const scope = { kind: 'organization' as const, id: 'fixture-org-a' };
const payload = { note: 'Private fixture contact: no real person', count: 1 };
const now = '2026-10-21T12:00:00Z';
const tokenAdapter = { sign: () => 'fixture', verify: () => ({ phone: 'fixture' }) };
const policy = {
  policyId: 'fixture-policy',
  revision: 1,
  grants: [
    { action: 'context.read', roles: ['organizer'] },
    { action: 'context.write', roles: ['organizer'] },
  ],
};
function keys(): StorageKeys {
  return {
    activeKeyId: 'fixture-key-a',
    encryptionKeys: new Map([['fixture-key-a', randomBytes(32)]]),
    fingerprintKey: randomBytes(32),
  };
}
async function principal(userId = 'fixture-user-a'): Promise<VerifiedPrincipal> {
  const result = await resolvePrincipal('fixture', tokenAdapter, {
    findByTokenIdentifier: async () => ({ userId, active: true }),
  });
  if (result.status !== 'authenticated') throw Error('Fixture identity failed');
  return result.principal;
}
function code(expected: string) {
  return (error: unknown) => error instanceof FoundationStoreError && error.code === expected;
}

describe('DEV-006 real Mongo transaction foundation', () => {
  let replica: MongoMemoryReplSet;
  let client: mongo.MongoClient;
  const database = `foundation_test_${randomUUID().replace(/-/g, '')}`;
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

  async function fixture(overrides: Partial<StoreOptions<Payload>> = {}) {
    const namespace = `f_${randomUUID().replace(/-/g, '')}`;
    let active = true;
    const options: StoreOptions<Payload> = {
      client,
      database,
      namespace,
      kind: 'fixture-context',
      schemaVersion: 'fixture-v1',
      schema,
      mode: 'mutable',
      readAction: 'context.read',
      writeAction: 'context.write',
      keys: keys(),
      clock: () => now,
      loadPolicy: async () => policy,
      memberships: {
        listForUser: async (userId) => [
          {
            membershipId: `member-${userId}`,
            userId,
            scope,
            role: 'organizer',
            active,
            validFrom: null,
            expiresAt: null,
          },
        ],
      },
      ...overrides,
    };
    const store = await openVersionedStore(options);
    const user = await principal();
    const command = {
      id: 'fixture-record-a',
      commandId: 'fixture-command-a',
      correlationId: 'fixture-flow',
      expectedRevision: 0,
      createScope: scope,
      payload,
    };
    const collection = (suffix: string) =>
      client.db(database).collection(`${options.namespace}_${suffix}`);
    const counts = async () =>
      Promise.all(
        ['records', 'revisions', 'audit', 'outbox', 'receipts'].map((name) =>
          collection(name).countDocuments(),
        ),
      );
    return {
      store,
      user,
      command,
      options,
      collection,
      counts,
      revoke: () => {
        active = false;
      },
    };
  }

  for (const verifyIntegrity of [false, true]) {
    it(`${verifyIntegrity ? 'rejects' : 'preserves legacy reads for'} a missing historical audit with integrity ${verifyIntegrity}`, async () => {
      const f = await fixture({ verifyIntegrity });
      const first = await f.store.write(f.user, f.command);
      const second = await f.store.write(f.user, { ...f.command, commandId: 'second-command', expectedRevision: 1,
        payload: { ...payload, count: 2 } });
      await f.collection('audit').deleteOne({ revision: 1 });
      if (verifyIntegrity) {
        await assert.rejects(f.store.history(f.user, f.command.id), code('INTEGRITY_FAILURE'));
        await assert.rejects(f.store.write(f.user, f.command), code('INTEGRITY_FAILURE'));
      } else {
        assert.deepEqual(await f.store.history(f.user, f.command.id), [first, second]);
        assert.deepEqual(await f.store.write(f.user, f.command), first);
      }
      assert.deepEqual(await f.store.read(f.user, f.command.id), second);
    });
  }

  it('commits encrypted record, immutable revision, audit, outbox and receipt together', async () => {
    const f = await fixture();
    const result = await f.store.write(f.user, f.command);
    assert.equal(result.revision, 1);
    assert.deepEqual(result.payload, payload);
    assert.deepEqual(await f.counts(), [1, 1, 1, 1, 1]);
    assert.deepEqual(await f.store.read(f.user, f.command.id), result);
    const raw = await f.collection('records').findOne();
    const audit = await f.collection('audit').findOne();
    assert.ok(raw && audit);
    assert.equal(JSON.stringify(raw).includes(payload.note), false);
    assert.equal(JSON.stringify(audit).includes(payload.note), false);
    const event = createJsonProtection(f.options.keys).open(
      audit.body,
      canonicalJson({
        database,
        namespace: f.options.namespace,
        eventId: audit._id,
        aggregate: raw._id,
        revision: 1,
      }),
    );
    assert.deepEqual(event, {
      event_id: result.eventId,
      ts: now,
      actor: f.user.userId,
      role: 'organizer',
      type: 'foundation.record.created',
      kind: 'fixture-context',
      action: 'context.write',
      membershipId: `member-${f.user.userId}`,
      scope,
      aggregateId: raw._id,
      revision: 1,
      schemaVersion: 'fixture-v1',
      commandId: f.command.commandId,
      correlationId: f.command.correlationId,
      before: null,
      after: payload,
    });
    const outbox = await f.collection('outbox').findOne();
    assert.equal(outbox?.eventId, result.eventId);
    assert.equal(outbox?.state, 'pending');
  });

  it('preserves immutable history and audit before/after across replacement', async () => {
    const f = await fixture();
    const first = await f.store.write(f.user, f.command);
    const second = await f.store.write(f.user, {
      ...f.command,
      commandId: 'command-b',
      expectedRevision: 1,
      payload: { note: 'Updated fixture', count: 2 },
    });
    assert.equal(second.revision, 2);
    assert.deepEqual(await f.store.history(f.user, f.command.id), [first, second]);
    assert.deepEqual(await f.counts(), [1, 2, 2, 2, 2]);
    const raw = await f.collection('records').findOne();
    const audit = await f.collection('audit').findOne({ revision: 2 });
    assert.ok(raw && audit);
    const event = createJsonProtection(f.options.keys).open(
      audit.body,
      canonicalJson({
        database,
        namespace: f.options.namespace,
        eventId: audit._id,
        aggregate: raw._id,
        revision: 2,
      }),
    );
    assert.ok(typeof event === 'object' && event !== null && 'before' in event && 'after' in event);
    assert.deepEqual(event.before, payload);
    assert.deepEqual(event.after, second.payload);
  });

  it('reads consistent history when a write commits between its database reads', async () => {
    const f = await fixture();
    const first = await f.store.write(f.user, f.command);
    const reader = await openVersionedStore({
      ...f.options,
      memberships: {
        listForUser: async (userId) => {
          await f.store.write(f.user, {
            ...f.command,
            commandId: 'concurrent-write',
            expectedRevision: 1,
            payload: { note: 'Committed during history read', count: 2 },
          });
          return f.options.memberships.listForUser(userId);
        },
      },
    });
    assert.deepEqual(await reader.history(f.user, f.command.id), [first]);
    assert.equal((await f.store.read(f.user, f.command.id))?.revision, 2);
  });

  for (const stage of ['audit', 'outbox', 'receipts']) {
    it(`rolls every write back when ${stage} rejects its insert`, async () => {
      const f = await fixture();
      // Real server validator, not a mocked repository or monkey-patched transaction.
      await client.db(database).command({
        collMod: `${f.options.namespace}_${stage}`,
        validator: { forcedFixtureFailure: { $exists: true } },
        validationLevel: 'strict',
      });
      await assert.rejects(f.store.write(f.user, f.command), code('STORAGE_UNAVAILABLE'));
      assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0]);
    });
  }

  it('rolls a replacement back to its prior payload and revision after audit failure', async () => {
    const f = await fixture();
    const first = await f.store.write(f.user, f.command);
    await client.db(database).command({
      collMod: `${f.options.namespace}_audit`,
      validator: { forcedFixtureFailure: { $exists: true } },
      validationLevel: 'strict',
    });
    await assert.rejects(
      f.store.write(f.user, {
        ...f.command,
        commandId: 'command-b',
        expectedRevision: 1,
        payload: { note: 'Must not persist', count: 2 },
      }),
      code('STORAGE_UNAVAILABLE'),
    );
    assert.deepEqual(await f.store.read(f.user, f.command.id), first);
    assert.deepEqual(await f.counts(), [1, 1, 1, 1, 1]);
  });

  it('replays the original command result even after a later revision', async () => {
    const f = await fixture();
    const first = await f.store.write(f.user, f.command);
    await f.store.write(f.user, {
      ...f.command,
      commandId: 'command-b',
      expectedRevision: 1,
      payload: { note: 'Second revision', count: 2 },
    });
    assert.deepEqual(await f.store.write(f.user, f.command), first);
    assert.deepEqual(await f.counts(), [1, 2, 2, 2, 2]);
  });

  it('rejects command ID reuse with different normalized input', async () => {
    const f = await fixture();
    await f.store.write(f.user, f.command);
    await assert.rejects(
      f.store.write(f.user, { ...f.command, payload: { note: 'Changed', count: 1 } }),
      code('IDEMPOTENCY_CONFLICT'),
    );
    assert.deepEqual(await f.counts(), [1, 1, 1, 1, 1]);
  });

  it('rejects stale revisions without adding events or receipts', async () => {
    const f = await fixture();
    await f.store.write(f.user, f.command);
    await assert.rejects(
      f.store.write(f.user, { ...f.command, commandId: 'command-stale' }),
      code('REVISION_CONFLICT'),
    );
    assert.deepEqual(await f.counts(), [1, 1, 1, 1, 1]);
  });

  it('allows exactly one of two simultaneous updates at the same expected revision', async () => {
    const f = await fixture();
    await f.store.write(f.user, f.command);
    const results = await Promise.allSettled(
      ['a', 'b'].map((name) =>
        f.store.write(f.user, {
          ...f.command,
          commandId: `parallel-${name}`,
          expectedRevision: 1,
          payload: { note: name, count: 2 },
        }),
      ),
    );
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.ok(rejected?.status === 'rejected' && code('REVISION_CONFLICT')(rejected.reason));
    assert.deepEqual(await f.counts(), [1, 2, 2, 2, 2]);
  });

  it('coalesces simultaneous identical creation retries into one immutable result', async () => {
    const f = await fixture();
    const results = await Promise.all([
      f.store.write(f.user, f.command),
      f.store.write(f.user, f.command),
    ]);
    assert.deepEqual(results[0], results[1]);
    assert.deepEqual(await f.counts(), [1, 1, 1, 1, 1]);
  });

  it('does not share retry receipts across different aggregates', async () => {
    const f = await fixture();
    await f.store.write(f.user, f.command);
    await f.store.write(f.user, { ...f.command, id: 'fixture-record-b' });
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2]);
  });

  it('reloads server scope and refuses attempted ownership changes', async () => {
    const f = await fixture();
    await f.store.write(f.user, f.command);
    await assert.rejects(
      f.store.write(f.user, {
        ...f.command,
        commandId: 'command-b',
        expectedRevision: 1,
        createScope: { kind: 'organization', id: 'fixture-org-b' },
      }),
      code('AUTH_SCOPE_DENIED'),
    );
    assert.deepEqual(await f.counts(), [1, 1, 1, 1, 1]);
  });

  for (const kind of ['customer', 'organization', 'partner'] as const) {
    it(`denies cross-${kind} creates without writing any state`, async () => {
      const f = await fixture();
      await assert.rejects(
        f.store.write(f.user, { ...f.command, createScope: { kind, id: 'another-scope' } }),
        code('AUTH_SCOPE_DENIED'),
      );
      assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0]);
    });
  }

  it('denies read, history, updates and retry replay after membership revocation', async () => {
    const f = await fixture();
    await f.store.write(f.user, f.command);
    f.revoke();
    for (const operation of [
      () => f.store.read(f.user, f.command.id),
      () => f.store.history(f.user, f.command.id),
      () => f.store.write(f.user, f.command),
    ])
      await assert.rejects(operation(), code('AUTH_SCOPE_DENIED'));
    assert.deepEqual(await f.counts(), [1, 1, 1, 1, 1]);
  });

  it('denies persisted data to a user with a different server membership scope', async () => {
    const f = await fixture();
    await f.store.write(f.user, f.command);
    const other = await openVersionedStore({
      ...f.options,
      memberships: {
        listForUser: async (userId) => [
          {
            membershipId: 'other',
            userId,
            role: 'organizer',
            active: true,
            validFrom: null,
            expiresAt: null,
            scope: { kind: 'organization', id: 'fixture-org-b' },
          },
        ],
      },
    });
    await assert.rejects(
      other.read(await principal('user-b'), f.command.id),
      code('AUTH_SCOPE_DENIED'),
    );
    await assert.rejects(
      other.history(await principal('user-b'), f.command.id),
      code('AUTH_SCOPE_DENIED'),
    );
    await assert.rejects(
      other.write(await principal('user-b'), {
        ...f.command,
        expectedRevision: 1,
        commandId: 'other-update',
      }),
      code('AUTH_SCOPE_DENIED'),
    );
  });

  it('rejects a serialized identity rather than trusting HTTP-shaped claims', async () => {
    const f = await fixture();
    const forged = JSON.parse(JSON.stringify(f.user)) as VerifiedPrincipal;
    await assert.rejects(f.store.write(forged, f.command), code('AUTH_SCOPE_DENIED'));
    assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0]);
  });

  it('fails closed on missing policy and membership storage failures', async () => {
    const f = await fixture({
      loadPolicy: async () => ({ policyId: 'empty', revision: 1, grants: [] }),
    });
    await assert.rejects(f.store.write(f.user, f.command), code('AUTH_SCOPE_DENIED'));
    const unavailable = await openVersionedStore({
      ...f.options,
      loadPolicy: async () => {
        throw Error('secret');
      },
    });
    await assert.rejects(unavailable.write(f.user, f.command), code('IDENTITY_UNAVAILABLE'));
    const unavailableMembership = await openVersionedStore({
      ...f.options,
      loadPolicy: async () => policy,
      memberships: {
        listForUser: async () => {
          throw Error('private database');
        },
      },
    });
    await assert.rejects(
      unavailableMembership.write(f.user, f.command),
      code('IDENTITY_UNAVAILABLE'),
    );
    assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0]);
  });

  it('enforces append-only record kinds while allowing exact retry replay', async () => {
    const f = await fixture({ mode: 'append-only' });
    const first = await f.store.write(f.user, f.command);
    assert.deepEqual(await f.store.write(f.user, f.command), first);
    await assert.rejects(
      f.store.write(f.user, { ...f.command, expectedRevision: 1, commandId: 'replace' }),
      code('RECORD_IMMUTABLE'),
    );
    assert.deepEqual(await f.counts(), [1, 1, 1, 1, 1]);
    const changedMode = await openVersionedStore({ ...f.options, mode: 'mutable' });
    await assert.rejects(
      changedMode.write(f.user, { ...f.command, expectedRevision: 1, commandId: 'unlock' }),
      code('RECORD_MODE_MISMATCH'),
    );
  });

  it('reports a fixed storage error when its injected client is closed', async () => {
    const f = await fixture();
    const connection = await new mongo.MongoClient(replica.getUri()).connect();
    const store = await openVersionedStore({ ...f.options, client: connection });
    await connection.close();
    await assert.rejects(store.write(f.user, f.command), code('STORAGE_UNAVAILABLE'));
    await assert.rejects(store.read(f.user, f.command.id), code('STORAGE_UNAVAILABLE'));
    assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0]);
  });

  it('retains reads and exact replay after closing and reopening a client', async () => {
    const f = await fixture();
    const original = await new mongo.MongoClient(replica.getUri()).connect();
    let first;
    try {
      const initial = await openVersionedStore({ ...f.options, client: original });
      first = await initial.write(f.user, f.command);
    } finally {
      await original.close();
    }
    const replacement = await new mongo.MongoClient(replica.getUri()).connect();
    try {
      const reopened = await openVersionedStore({ ...f.options, client: replacement });
      assert.deepEqual(await reopened.read(f.user, f.command.id), first);
      assert.deepEqual(await reopened.write(f.user, f.command), first);
      assert.deepEqual(await reopened.history(f.user, f.command.id), [first]);
    } finally {
      await replacement.close();
    }
  });

  it('retains unique revision/event/outbox indexes and rejects duplicate revision inserts', async () => {
    const f = await fixture();
    await f.store.write(f.user, f.command);
    const revision = await f.collection('revisions').findOne();
    assert.ok(revision);
    await assert.rejects(
      f.collection('revisions').insertOne({ ...revision, _id: new mongo.ObjectId() }),
      (error: unknown) => error instanceof mongo.MongoServerError && error.code === 11000,
    );
    for (const name of ['revisions', 'audit', 'outbox']) {
      const indexes = await f.collection(name).indexes();
      assert.ok(indexes.some((index) => index.unique === true && index.name !== '_id_'));
    }
  });

  it('rejects corrupted ciphertext and metadata without exposing private data', async () => {
    const f = await fixture();
    await f.store.write(f.user, f.command);
    await f.collection('records').updateOne({}, { $set: { 'payload.tag': '00'.repeat(16) } });
    await assert.rejects(f.store.read(f.user, f.command.id), code('INTEGRITY_FAILURE'));
    await assert.rejects(
      f.store.write(f.user, { ...f.command, commandId: 'changed', expectedRevision: 1 }),
      code('INTEGRITY_FAILURE'),
    );
    assert.deepEqual(await f.counts(), [1, 1, 1, 1, 1]);
  });

  it('authenticates stored ownership before releasing immutable history', async () => {
    const f = await fixture();
    await f.store.write(f.user, f.command);
    await f
      .collection('records')
      .updateOne({}, { $set: { scope: { kind: 'organization', id: 'fixture-org-b' } } });
    const other = await openVersionedStore({
      ...f.options,
      memberships: {
        listForUser: async (userId) => [
          {
            membershipId: 'other',
            userId,
            role: 'organizer',
            active: true,
            validFrom: null,
            expiresAt: null,
            scope: { kind: 'organization', id: 'fixture-org-b' },
          },
        ],
      },
    });
    await assert.rejects(
      other.history(await principal('other-user'), f.command.id),
      code('INTEGRITY_FAILURE'),
    );
  });

  it('rejects incomplete history and modified retry revision metadata', async () => {
    const f = await fixture();
    await f.store.write(f.user, f.command);
    await f.store.write(f.user, { ...f.command, expectedRevision: 1, commandId: 'second' });
    await f.collection('receipts').updateOne({ revision: 1 }, { $set: { revision: 2 } });
    await assert.rejects(f.store.write(f.user, f.command), code('INTEGRITY_FAILURE'));
    await f.collection('revisions').deleteOne({ revision: 1 });
    await assert.rejects(f.store.history(f.user, f.command.id), code('INTEGRITY_FAILURE'));
  });

  it('refuses unknown persisted schema versions instead of guessing a migration', async () => {
    const f = await fixture();
    await f.store.write(f.user, f.command);
    const upgraded = await openVersionedStore({ ...f.options, schemaVersion: 'fixture-v2' });
    await assert.rejects(upgraded.read(f.user, f.command.id), code('SCHEMA_VERSION_UNSUPPORTED'));
    await assert.rejects(
      upgraded.write(f.user, { ...f.command, commandId: 'upgrade', expectedRevision: 1 }),
      code('SCHEMA_VERSION_UNSUPPORTED'),
    );
    assert.deepEqual(await f.counts(), [1, 1, 1, 1, 1]);
  });

  it('requires retained decryption keys after key rotation', async () => {
    const f = await fixture();
    const first = await f.store.write(f.user, f.command);
    const rotatedKeys = {
      ...f.options.keys,
      activeKeyId: 'fixture-key-b',
      encryptionKeys: new Map([
        ...f.options.keys.encryptionKeys,
        ['fixture-key-b', randomBytes(32)],
      ]),
    };
    const rotated = await openVersionedStore({ ...f.options, keys: rotatedKeys });
    assert.deepEqual(await rotated.read(f.user, f.command.id), first);
    await rotated.write(f.user, { ...f.command, expectedRevision: 1, commandId: 'rotated' });
    assert.equal((await f.collection('records').findOne())?.payload.keyId, 'fixture-key-b');
    assert.deepEqual(await rotated.write(f.user, f.command), first);
    const withoutOldKey = await openVersionedStore({
      ...f.options,
      keys: { ...rotatedKeys, encryptionKeys: new Map([['fixture-key-b', randomBytes(32)]]) },
    });
    await assert.rejects(withoutOldKey.history(f.user, f.command.id), code('INTEGRITY_FAILURE'));
  });

  it('rejects invalid payload, unsafe revision, missing creation scope and invalid clock before writes', async () => {
    const f = await fixture();
    await assert.rejects(
      f.store.write(f.user, { ...f.command, payload: { ...payload, role: 'admin' } }),
      code('INVALID_RECORD'),
    );
    await assert.rejects(
      f.store.write(f.user, { ...f.command, expectedRevision: Number.MAX_SAFE_INTEGER }),
      code('INVALID_REQUEST'),
    );
    const { id, commandId, correlationId, expectedRevision, payload: commandPayload } = f.command;
    const withoutScope = {
      id,
      commandId,
      correlationId,
      expectedRevision,
      payload: commandPayload,
    };
    await assert.rejects(f.store.write(f.user, withoutScope), code('INVALID_REQUEST'));
    const badClock = await openVersionedStore({ ...f.options, clock: () => 'invalid' });
    await assert.rejects(badClock.write(f.user, f.command), code('INVALID_REQUEST'));
    assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0]);
  });

  it('rejects a non-stable decoder instead of changing a stored value on each read', async () => {
    const unstable = schema.transform((value) => ({ ...value, count: value.count + 1 }));
    const f = await fixture({ schema: unstable });
    await assert.rejects(f.store.write(f.user, f.command), code('INVALID_RECORD'));
    assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0]);
  });

  it('returns empty reads/history for missing records', async () => {
    const f = await fixture();
    assert.equal(await f.store.read(f.user, 'missing'), null);
    assert.deepEqual(await f.store.history(f.user, 'missing'), []);
  });

  it('rejects standalone MongoDB before creating persistence collections', async () => {
    const standalone = await MongoMemoryServer.create();
    const connection = await new mongo.MongoClient(standalone.getUri()).connect();
    try {
      const f = await fixture();
      await assert.rejects(
        openVersionedStore({ ...f.options, client: connection }),
        code('TRANSACTIONS_REQUIRED'),
      );
      assert.equal((await connection.db(database).listCollections().toArray()).length, 0);
    } finally {
      await connection.close();
      await standalone.stop();
    }
  });
});

describe('authenticated JSON storage protection', () => {
  it('canonicalizes object key order and rejects values JSON would silently lose', () => {
    assert.equal(canonicalJson({ b: [2, 1], a: 'x' }), canonicalJson({ a: 'x', b: [2, 1] }));
    for (const invalid of [undefined, NaN, Infinity, { a: undefined }, new Date(), [, 1], 1n])
      assert.throws(() => canonicalJson(invalid));
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    assert.throws(() => canonicalJson(cyclic));
  });

  it('binds encrypted values to their record and rejects missing or malformed keys', () => {
    const config = keys();
    const protection = createJsonProtection(config);
    const encrypted = protection.seal(payload, 'record-a');
    assert.deepEqual(protection.open(encrypted, 'record-a'), payload);
    assert.throws(() => protection.open(encrypted, 'record-b'));
    assert.throws(() => protection.open({ ...encrypted, keyId: 'missing' }, 'record-a'));
    assert.throws(() => createJsonProtection({ ...config, fingerprintKey: Buffer.alloc(1) }));
    assert.throws(() => createJsonProtection({ ...config, encryptionKeys: new Map() }));
    assert.throws(() =>
      createJsonProtection({
        ...config,
        encryptionKeys: new Map([['fixture-key-a', Buffer.alloc(1)]]),
      }),
    );
  });
});
