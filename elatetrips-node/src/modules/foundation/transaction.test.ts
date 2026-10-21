import { strict as assert } from 'node:assert';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { mongo } from 'mongoose';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { z } from 'zod';
import { canonicalJson, type StorageKeys } from './encrypted-json';
import { resolvePrincipal, type VerifiedPrincipal } from './identity';
import {
  openRecordTransaction,
  openVersionedStore,
  FoundationStoreError,
  type RecordTransactionOptions,
  type RecordTransactionRequest,
} from './persistence';
import { openOutboxWorker } from './outbox';
import { openSnapshotProjection } from './projection';

const alphaSchema = z.object({ note: z.string(), count: z.number().int().nonnegative() }).strict();
const betaSchema = alphaSchema.extend({ link: z.string() }).strict();
const now = '2026-10-21T12:00:00.000Z';
const scope = { kind: 'organization' as const, id: 'fixture-org' };
const alphaPayload = { note: 'Private synthetic alpha', count: 1 };
const betaPayload = { note: 'Private synthetic beta', count: 1, link: 'alpha-1' };
function code(expected: string) {
  return (error: unknown) => error instanceof FoundationStoreError && error.code === expected;
}

describe('real Mongo atomic multi-record commands', () => {
  let replica: MongoMemoryReplSet;
  let client: mongo.MongoClient;
  const database = `transaction_test_${randomUUID().replace(/-/g, '')}`;
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

  async function fixture(betaMode: 'mutable' | 'append-only' = 'mutable') {
    const namespace = `t_${randomUUID().replace(/-/g, '')}`;
    const keys: StorageKeys = {
      activeKeyId: 'fixture-key',
      encryptionKeys: new Map([['fixture-key', randomBytes(32)]]),
      fingerprintKey: randomBytes(32),
    };
    const identity = await resolvePrincipal(
      'fixture',
      { sign: () => '', verify: () => ({ phone: 'fixture' }) },
      {
        findByTokenIdentifier: async () => ({ userId: 'fixture-user', active: true }),
      },
    );
    if (identity.status !== 'authenticated') throw Error('Fixture identity failed');
    let active = true;
    let deniedAction = '';
    let onLookup: (() => Promise<void>) | undefined;
    const common = {
      client,
      database,
      namespace,
      keys,
      schemaVersion: 'fixture-v1',
      clock: () => now,
      memberships: {
        listForUser: async (userId: string) => {
          const callback = onLookup;
          onLookup = undefined;
          if (callback) await callback();
          return [
            {
              membershipId: 'fixture-member',
              userId,
              scope,
              role: 'organizer',
              active,
              validFrom: null,
              expiresAt: null,
            },
          ];
        },
      },
      loadPolicy: async () => ({
        policyId: 'fixture-permissions',
        revision: 1,
        grants: ['context.read', 'context.write', 'proposal.read', 'proposal.write']
          .filter((action) => action !== deniedAction)
          .map((action) => ({ action, roles: ['organizer'] })),
      }),
    };
    async function stores(connection = client, ns = namespace) {
      const alpha = await openVersionedStore({
        ...common,
        client: connection,
        namespace: ns,
        kind: 'fixture-alpha',
        schema: alphaSchema,
        mode: 'mutable',
        readAction: 'context.read',
        writeAction: 'context.write',
      });
      const beta = await openVersionedStore({
        ...common,
        client: connection,
        namespace: ns,
        kind: 'fixture-beta',
        schema: betaSchema,
        mode: betaMode,
        readAction: 'proposal.read',
        writeAction: 'proposal.write',
      });
      return { alpha, beta };
    }
    const { alpha, beta } = await stores();
    const options: RecordTransactionOptions = {
      client,
      database,
      namespace,
      keys,
      clock: () => now,
      policy: { policyId: 'fixture-group', revision: 1, maxRecords: 4 },
      validate: (changes) => {
        if (changes.length !== 2) return false;
        const a = changes.find((change) => change.kind === 'fixture-alpha');
        const b = changes.find((change) => change.kind === 'fixture-beta');
        if (!a || !b) return false;
        const left = alphaSchema.parse(a.after);
        const right = betaSchema.parse(b.after);
        return left.count === right.count && right.link === a.id;
      },
    };
    const transaction = await openRecordTransaction(options);
    const request = (revision = 1): RecordTransactionRequest => ({
      commandId: `group-${revision}`,
      correlationId: 'fixture-flow',
      changes: [
        {
          store: alpha,
          record: {
            id: 'alpha-1',
            expectedRevision: revision - 1,
            createScope: scope,
            payload: { ...alphaPayload, count: revision },
          },
        },
        {
          store: beta,
          record: {
            id: 'beta-1',
            expectedRevision: revision - 1,
            createScope: scope,
            payload: { ...betaPayload, count: revision },
          },
        },
      ],
    });
    const collection = (suffix: string) => client.db(database).collection(`${namespace}_${suffix}`);
    const counts = () =>
      Promise.all(
        ['records', 'revisions', 'audit', 'outbox', 'receipts', 'transaction_receipts'].map(
          (suffix) => collection(suffix).countDocuments(),
        ),
      );
    const validator = async (suffix: string, value: Record<string, unknown>) =>
      client.db(database).command({
        collMod: `${namespace}_${suffix}`,
        validator: value,
        validationLevel: 'strict',
      });
    return {
      alpha,
      beta,
      options,
      transaction,
      request,
      collection,
      counts,
      validator,
      common,
      stores,
      user: identity.principal,
      afterNextLookup: (callback: () => Promise<void>) => {
        onLookup = callback;
      },
      revoke: () => {
        active = false;
      },
      deny: (action: string) => {
        deniedAction = action;
      },
    };
  }

  it('commits multiple kinds with their versions, audits, outbox and encrypted group receipt', async () => {
    const f = await fixture();
    const result = await f.transaction.write(f.user, f.request());
    assert.equal(result.records.length, 2);
    assert.deepEqual(
      result.records.map((record) => [record.kind, record.id, record.revision]),
      [
        ['fixture-alpha', 'alpha-1', 1],
        ['fixture-beta', 'beta-1', 1],
      ],
    );
    assert.deepEqual((await f.alpha.read(f.user, 'alpha-1'))?.payload, alphaPayload);
    assert.deepEqual((await f.beta.read(f.user, 'beta-1'))?.payload, betaPayload);
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
    const receipt = await f.collection('transaction_receipts').findOne({});
    assert.ok(receipt);
    assert.equal(JSON.stringify(receipt).includes(alphaPayload.note), false);
    assert.equal(JSON.stringify(receipt).includes('alpha-1'), false);
  });

  it('returns original versions on exact replay after independent later writes', async () => {
    const f = await fixture();
    const request = f.request();
    const original = await f.transaction.write(f.user, request);
    await f.alpha.write(f.user, {
      id: 'alpha-1',
      commandId: 'independent',
      correlationId: 'other-flow',
      expectedRevision: 1,
      payload: { ...alphaPayload, count: 2 },
    });
    assert.deepEqual(await f.transaction.write(f.user, request), original);
    assert.equal((await f.alpha.read(f.user, 'alpha-1'))?.revision, 2);
    assert.deepEqual(await f.counts(), [2, 3, 3, 3, 3, 1]);
  });

  it('reads all records from one snapshot while another group commits between its reads', async () => {
    const f = await fixture();
    await f.transaction.write(f.user, f.request());
    f.afterNextLookup(async () => {
      await f.transaction.write(f.user, f.request(2));
    });
    const snapshot = await f.transaction.read(f.user, [
      { store: f.alpha, id: 'alpha-1' },
      { store: f.beta, id: 'beta-1' },
    ]);
    assert.deepEqual(
      snapshot.records.map((item) => item.record?.revision),
      [1, 1],
    );
    assert.equal((await f.alpha.read(f.user, 'alpha-1'))?.revision, 2);
    assert.equal((await f.beta.read(f.user, 'beta-1'))?.revision, 2);
    assert.deepEqual(await f.counts(), [2, 4, 4, 4, 4, 2]);
  });

  it('rejects the group read if one existing member is unauthorized', async () => {
    const f = await fixture();
    await f.transaction.write(f.user, f.request());
    f.deny('proposal.read');
    await assert.rejects(
      f.transaction.read(f.user, [
        { store: f.alpha, id: 'alpha-1' },
        { store: f.beta, id: 'beta-1' },
      ]),
      code('AUTH_SCOPE_DENIED'),
    );
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
  });

  it('returns missing group members as null and rejects invalid read capabilities or duplicate targets', async () => {
    const f = await fixture();
    await f.transaction.write(f.user, f.request());
    const result = await f.transaction.read(f.user, [
      { store: f.beta, id: 'missing' },
      { store: f.alpha, id: 'alpha-1' },
    ]);
    assert.equal(result.records[0].record?.revision, 1);
    assert.equal(result.records[1].record, null);
    await assert.rejects(
      f.transaction.read(f.user, [{ store: {}, id: 'alpha-1' }]),
      code('INVALID_REQUEST'),
    );
    await assert.rejects(
      f.transaction.read(f.user, [
        { store: f.alpha, id: 'alpha-1' },
        { store: f.alpha, id: 'alpha-1' },
      ]),
      code('INVALID_REQUEST'),
    );
  });

  it('treats reordering the same record set as the same command intent', async () => {
    const f = await fixture();
    const request = f.request();
    const original = await f.transaction.write(f.user, request);
    assert.deepEqual(
      await f.transaction.write(f.user, { ...request, changes: [...request.changes].reverse() }),
      original,
    );
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
  });

  it('rejects changed payload, correlation or record set under a consumed group ID', async () => {
    const f = await fixture();
    await f.transaction.write(f.user, f.request());
    const changed = f.request();
    changed.changes[0].record.payload = { ...alphaPayload, count: 99 };
    for (const request of [
      changed,
      { ...f.request(), correlationId: 'other-flow' },
      { ...f.request(), changes: f.request().changes.slice(0, 1) },
    ])
      await assert.rejects(f.transaction.write(f.user, request), code('IDEMPOTENCY_CONFLICT'));
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
  });

  it('rejects a stale member before changing another member', async () => {
    const f = await fixture();
    await f.transaction.write(f.user, f.request());
    await f.beta.write(f.user, {
      id: 'beta-1',
      expectedRevision: 1,
      commandId: 'independent',
      correlationId: 'other-flow',
      payload: { ...betaPayload, count: 2 },
    });
    await assert.rejects(f.transaction.write(f.user, f.request(2)), code('REVISION_CONFLICT'));
    assert.equal((await f.alpha.read(f.user, 'alpha-1'))?.revision, 1);
    assert.deepEqual(await f.counts(), [2, 3, 3, 3, 3, 1]);
  });

  it('allows only one conflicting group at the same expected revisions', async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      f.transaction.write(f.user, f.request()),
      f.transaction.write(f.user, { ...f.request(), commandId: 'competing-group' }),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejection = results.find((result) => result.status === 'rejected');
    assert.ok(rejection?.status === 'rejected' && code('REVISION_CONFLICT')(rejection.reason));
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
  });

  it('coalesces simultaneous exact group retries into the same immutable result', async () => {
    const f = await fixture();
    const results = await Promise.all([
      f.transaction.write(f.user, f.request()),
      f.transaction.write(f.user, f.request()),
    ]);
    assert.deepEqual(results[0], results[1]);
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
  });

  it('does not partially commit a group racing an independent write', async () => {
    const f = await fixture();
    await f.transaction.write(f.user, f.request());
    const [group, single] = await Promise.allSettled([
      f.transaction.write(f.user, f.request(2)),
      f.alpha.write(f.user, {
        id: 'alpha-1',
        expectedRevision: 1,
        commandId: 'racing-single',
        correlationId: 'other-flow',
        payload: { ...alphaPayload, count: 50 },
      }),
    ]);
    if (group.status === 'fulfilled') {
      assert.ok(single.status === 'rejected' && code('REVISION_CONFLICT')(single.reason));
      assert.equal((await f.beta.read(f.user, 'beta-1'))?.revision, 2);
    } else {
      assert.ok(code('REVISION_CONFLICT')(group.reason));
      assert.equal(single.status, 'fulfilled');
      assert.equal((await f.beta.read(f.user, 'beta-1'))?.revision, 1);
    }
  });

  for (const suffix of [
    'records',
    'revisions',
    'audit',
    'outbox',
    'receipts',
    'transaction_receipts',
  ]) {
    it(`rolls back the entire group when ${suffix} rejects an insert`, async () => {
      const f = await fixture();
      const betaAggregate = createHash('sha256')
        .update(canonicalJson(['fixture-beta', 'beta-1']))
        .digest('hex');
      const validation =
        suffix === 'records'
          ? { _id: { $ne: betaAggregate } }
          : ['revisions', 'audit', 'receipts'].includes(suffix)
            ? { aggregateId: { $ne: betaAggregate } }
            : { forcedFailure: { $exists: true } };
      await f.validator(suffix, validation);
      await assert.rejects(f.transaction.write(f.user, f.request()), code('STORAGE_UNAVAILABLE'));
      assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0, 0]);
    });
  }

  it('restores both prior records if the final group receipt fails during replacement', async () => {
    const f = await fixture();
    await f.transaction.write(f.user, f.request());
    await f.validator('transaction_receipts', { forcedFailure: { $exists: true } });
    await assert.rejects(f.transaction.write(f.user, f.request(2)), code('STORAGE_UNAVAILABLE'));
    assert.equal((await f.alpha.read(f.user, 'alpha-1'))?.revision, 1);
    assert.equal((await f.beta.read(f.user, 'beta-1'))?.revision, 1);
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
  });

  it('requires the configured cross-record guard rather than inventing a domain rule', async () => {
    const f = await fixture();
    const request = f.request();
    request.changes[1].record.payload = { ...betaPayload, count: 2 };
    await assert.rejects(f.transaction.write(f.user, request), code('RULE_DENIED'));
    const denied = await openRecordTransaction({
      ...f.options,
      validate: () => {
        throw Error('Private guard data');
      },
    });
    await assert.rejects(denied.write(f.user, f.request()), code('RULE_DENIED'));
    assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0, 0]);
  });

  it('provides frozen detached guard snapshots that cannot mutate staged payloads', async () => {
    const f = await fixture();
    const unsafe = await openRecordTransaction({
      ...f.options,
      validate: (changes) => {
        assert.equal(Object.isFrozen(changes), true);
        assert.equal(Object.isFrozen(changes[0].after), true);
        Object.assign(changes[0].scope, { id: 'modified-scope' });
        return true;
      },
    });
    await assert.rejects(unsafe.write(f.user, f.request()), code('RULE_DENIED'));
    assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0, 0]);
  });

  it('refreshes every member permission and denies group replay after revocation', async () => {
    const f = await fixture();
    f.deny('proposal.write');
    await assert.rejects(f.transaction.write(f.user, f.request()), code('AUTH_SCOPE_DENIED'));
    assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0, 0]);
    f.deny('');
    await f.transaction.write(f.user, f.request());
    f.revoke();
    await assert.rejects(f.transaction.write(f.user, f.request()), code('AUTH_SCOPE_DENIED'));
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
  });

  for (const kind of ['customer', 'organization', 'partner'] as const) {
    it(`rejects a cross-${kind} member without writing another group member`, async () => {
      const f = await fixture();
      const request = f.request();
      request.changes[1].record.createScope = { kind, id: 'other-scope' };
      await assert.rejects(f.transaction.write(f.user, request), code('AUTH_SCOPE_DENIED'));
      assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0, 0]);
    });
  }

  it('rejects JSON-shaped principals and unregistered/copied store objects', async () => {
    const f = await fixture();
    await assert.rejects(
      f.transaction.write(JSON.parse(JSON.stringify(f.user)) as VerifiedPrincipal, f.request()),
      code('AUTH_SCOPE_DENIED'),
    );
    for (const store of [{}, { ...f.alpha }]) {
      const request = f.request();
      request.changes[0].store = store;
      await assert.rejects(f.transaction.write(f.user, request), code('INVALID_REQUEST'));
    }
    assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0, 0]);
  });

  it('refuses stores from another namespace or another client/session owner', async () => {
    const f = await fixture();
    const otherNamespace = await f.stores(client, `${f.options.namespace}_other`);
    const otherClient = await new mongo.MongoClient(replica.getUri()).connect();
    try {
      const otherConnection = await f.stores(otherClient);
      for (const alpha of [otherNamespace.alpha, otherConnection.alpha]) {
        const request = f.request();
        request.changes[0].store = alpha;
        await assert.rejects(f.transaction.write(f.user, request), code('INVALID_REQUEST'));
      }
    } finally {
      await otherClient.close();
    }
    assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0, 0]);
  });

  it('rejects duplicate targets, empty groups, invalid payloads and configured size limits', async () => {
    const f = await fixture();
    const request = f.request();
    await assert.rejects(
      f.transaction.write(f.user, {
        ...request,
        changes: [request.changes[0], request.changes[0]],
      }),
      code('INVALID_REQUEST'),
    );
    await assert.rejects(
      f.transaction.write(f.user, { ...request, changes: [] }),
      code('INVALID_REQUEST'),
    );
    const invalid = f.request();
    invalid.changes[1].record.payload = { ...betaPayload, unexpected: true };
    await assert.rejects(f.transaction.write(f.user, invalid), code('INVALID_RECORD'));
    const limited = await openRecordTransaction({
      ...f.options,
      policy: { ...f.options.policy, maxRecords: 1 },
    });
    await assert.rejects(limited.write(f.user, request), code('BATCH_LIMIT_EXCEEDED'));
    assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0, 0]);
  });

  it('preserves append-only records and rolls back a proposed companion update', async () => {
    const f = await fixture('append-only');
    await f.transaction.write(f.user, f.request());
    await assert.rejects(f.transaction.write(f.user, f.request(2)), code('RECORD_IMMUTABLE'));
    assert.equal((await f.alpha.read(f.user, 'alpha-1'))?.revision, 1);
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
  });

  it('cannot mistake an independently committed subcommand for an atomic group', async () => {
    const f = await fixture();
    const commandId = `transaction:${createHash('sha256')
      .update(canonicalJson([f.options.policy.policyId, 'group-1', 'fixture-alpha', 'alpha-1']))
      .digest('hex')}`;
    await f.alpha.write(f.user, {
      id: 'alpha-1',
      expectedRevision: 0,
      createScope: scope,
      commandId,
      correlationId: 'fixture-flow',
      payload: alphaPayload,
    });
    await assert.rejects(f.transaction.write(f.user, f.request()), code('REVISION_CONFLICT'));
    assert.equal(await f.beta.read(f.user, 'beta-1'), null);
    assert.deepEqual(await f.counts(), [1, 1, 1, 1, 1, 0]);
  });

  it('rejects changed policy revisions and corrupted group receipts instead of re-executing', async () => {
    const f = await fixture();
    await f.transaction.write(f.user, f.request());
    const changed = await openRecordTransaction({
      ...f.options,
      policy: { ...f.options.policy, revision: 2 },
    });
    await assert.rejects(changed.write(f.user, f.request()), code('IDEMPOTENCY_CONFLICT'));
    await f
      .collection('transaction_receipts')
      .updateOne({}, { $set: { 'body.tag': '00'.repeat(16) } });
    await assert.rejects(f.transaction.write(f.user, f.request()), code('INTEGRITY_FAILURE'));
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
  });

  it('fails closed if a group result has lost its current or immutable record', async () => {
    const f = await fixture();
    await f.transaction.write(f.user, f.request());
    await f.collection('revisions').deleteOne({});
    await assert.rejects(f.transaction.write(f.user, f.request()), code('INTEGRITY_FAILURE'));
    await f.collection('records').deleteMany({});
    await assert.rejects(f.transaction.write(f.user, f.request()), code('INTEGRITY_FAILURE'));
    assert.equal(await f.collection('transaction_receipts').countDocuments(), 1);
  });

  it('replays original results after reopening both participant stores and coordinator', async () => {
    const f = await fixture();
    const original = await f.transaction.write(f.user, f.request());
    const connection = await new mongo.MongoClient(replica.getUri()).connect();
    try {
      const stores = await f.stores(connection);
      const transaction = await openRecordTransaction({ ...f.options, client: connection });
      const request = f.request();
      request.changes[0].store = stores.alpha;
      request.changes[1].store = stores.beta;
      assert.deepEqual(await transaction.write(f.user, request), original);
    } finally {
      await connection.close();
    }
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
  });

  it('delivers committed group events through the existing outbox and projections', async () => {
    const f = await fixture();
    await f.transaction.write(f.user, f.request());
    const alpha = await openSnapshotProjection({
      ...f.common,
      projectionId: 'alpha-view',
      kind: 'fixture-alpha',
      schema: alphaSchema,
      readAction: 'context.read',
    });
    const beta = await openSnapshotProjection({
      ...f.common,
      projectionId: 'beta-view',
      kind: 'fixture-beta',
      schema: betaSchema,
      readAction: 'proposal.read',
    });
    const worker = await openOutboxWorker({
      ...f.common,
      policy: {
        policyId: 'fixture-delivery',
        revision: 1,
        leaseDurationMs: 100,
        maxAttempts: 2,
        retryDelaysMs: [10],
      },
    });
    for (let index = 0; index < 2; index++)
      assert.equal(
        (
          await worker.runOnce('fixture-worker', (message) =>
            message.event.kind === 'fixture-alpha' ? alpha.handle(message) : beta.handle(message),
          )
        ).status,
        'delivered',
      );
    assert.deepEqual((await alpha.read(f.user, 'alpha-1'))?.payload, alphaPayload);
    assert.deepEqual((await beta.read(f.user, 'beta-1'))?.payload, betaPayload);
    assert.equal(await f.collection('projection_audit').countDocuments(), 2);
    assert.deepEqual(await f.counts(), [2, 2, 2, 2, 2, 1]);
  });

  it('requires explicit versioned policy/guard and rejects invalid clocks and closed storage', async () => {
    const f = await fixture();
    await assert.rejects(
      openRecordTransaction({ ...f.options, policy: { ...f.options.policy, maxRecords: 0 } }),
      code('INVALID_REQUEST'),
    );
    const badClock = await openRecordTransaction({ ...f.options, clock: () => 'invalid' });
    await assert.rejects(badClock.write(f.user, f.request()), code('INVALID_REQUEST'));
    const connection = await new mongo.MongoClient(replica.getUri()).connect();
    const stores = await f.stores(connection);
    const transaction = await openRecordTransaction({ ...f.options, client: connection });
    await connection.close();
    const request = f.request();
    request.changes[0].store = stores.alpha;
    request.changes[1].store = stores.beta;
    await assert.rejects(transaction.write(f.user, request), code('STORAGE_UNAVAILABLE'));
    assert.deepEqual(await f.counts(), [0, 0, 0, 0, 0, 0]);
  });

  it('rejects standalone Mongo before creating group receipt storage', async () => {
    const f = await fixture();
    const standalone = await MongoMemoryServer.create();
    const connection = await new mongo.MongoClient(standalone.getUri()).connect();
    try {
      await assert.rejects(
        openRecordTransaction({ ...f.options, client: connection }),
        code('TRANSACTIONS_REQUIRED'),
      );
      assert.equal((await connection.db(database).listCollections().toArray()).length, 0);
    } finally {
      await connection.close();
      await standalone.stop();
    }
  });
});
