import { createHash, randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { z } from 'zod';
import { authorizeResource, type MembershipDirectory, type VerifiedPrincipal } from './identity';
import {
  canonicalJson,
  createJsonProtection,
  type EncryptedJson,
  type StorageKeys,
} from './encrypted-json';
import { deliverySchema, pendingDelivery, type OutboxDelivery } from './outbox-record';
import { authenticateFoundationEvent } from './foundation-event';

const scopeSchema = z
  .object({
    kind: z.enum(['customer', 'organization', 'partner']),
    id: z
      .string()
      .min(1)
      .refine((id) => id.trim() === id && !id.includes('\0')),
  })
  .strict();
type Scope = z.infer<typeof scopeSchema>;
const idSchema = z
  .string()
  .min(1)
  .refine((id) => id.trim() === id && !id.includes('\0'));
const commandSchema = z
  .object({
    id: idSchema,
    commandId: idSchema,
    correlationId: idSchema,
    expectedRevision: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
    createScope: scopeSchema.optional(),
    payload: z.unknown(),
  })
  .strict();
const recordSchema = z
  .object({
    _id: z.string(),
    scope: scopeSchema,
    schemaVersion: z.string(),
    mode: z.enum(['mutable', 'append-only']),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    eventId: z.string(),
    payload: z.unknown(),
  })
  .strict();

type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_RECORD'
  | 'AUTH_SCOPE_DENIED'
  | 'POLICY_INVALID'
  | 'IDENTITY_UNAVAILABLE'
  | 'REVISION_CONFLICT'
  | 'RECORD_IMMUTABLE'
  | 'RECORD_MODE_MISMATCH'
  | 'IDEMPOTENCY_CONFLICT'
  | 'STORAGE_UNAVAILABLE'
  | 'INTEGRITY_FAILURE'
  | 'SCHEMA_VERSION_UNSUPPORTED'
  | 'RULE_DENIED'
  | 'BATCH_LIMIT_EXCEEDED'
  | 'TRANSACTIONS_REQUIRED';
export class FoundationStoreError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'FoundationStoreError';
  }
}
function fail(code: ErrorCode): never {
  throw new FoundationStoreError(code);
}
interface Row {
  _id: string;
  scope: Scope;
  schemaVersion: string;
  mode: 'mutable' | 'append-only';
  revision: number;
  eventId: string;
  payload: EncryptedJson;
}
interface Revision extends Row {
  aggregateId: string;
}
interface Event {
  _id: string;
  aggregateId: string;
  revision: number;
  body: EncryptedJson;
}
interface Receipt {
  _id: string;
  aggregateId: string;
  fingerprint: string;
  revision: number;
}
export interface RecordVersion<T> {
  revision: number;
  eventId: string;
  payload: T;
}
export interface WriteRecord {
  id: string;
  commandId: string;
  correlationId: string;
  expectedRevision: number;
  /** SERVER-RESOLVED ownership for a new aggregate, never accepted from an HTTP body. */
  createScope?: Scope;
  payload: unknown;
}
export interface StoreOptions<T> {
  /** Require the matching authenticated audit, revision and durable subreceipt on reads/replays. */
  verifyIntegrity?: boolean;
  client: mongo.MongoClient;
  database: string;
  namespace: string;
  kind: string;
  schemaVersion: string;
  /** Strict, JSON-stable server validator. Domain transitions belong to an application service. */
  schema: z.ZodType<T>;
  mode: 'mutable' | 'append-only';
  readAction: string;
  writeAction: string;
  memberships: MembershipDirectory;
  loadPolicy(): Promise<unknown>;
  clock(): string;
  keys: StorageKeys;
}

const changeSchema = z
  .object({
    kind: idSchema,
    id: idSchema,
    scope: scopeSchema,
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    expectedRevision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    before: z.unknown(),
    after: z.unknown(),
  })
  .strict()
  .refine((value) => 'before' in value && 'after' in value);
export type RecordChange = Readonly<z.infer<typeof changeSchema>>;
type TransactionContext = { receiptId: string; fingerprint: string };
interface PendingRecord<T = unknown> {
  change: RecordChange;
  intent: unknown;
  assertWritable(): void;
  commit(context?: TransactionContext): Promise<RecordVersion<T>>;
  original(revision: number, eventId?: string): Promise<RecordVersion<T>>;
}
interface Participant {
  client: mongo.MongoClient;
  database: string;
  namespace: string;
  kind: string;
  normalize(input: WriteRecord): WriteRecord;
  read(
    principal: VerifiedPrincipal,
    id: string,
    session: mongo.ClientSession,
    ts: string,
  ): Promise<RecordVersion<unknown> | null>;
  stage(
    principal: VerifiedPrincipal,
    input: WriteRecord,
    session: mongo.ClientSession,
    ts: string,
  ): Promise<PendingRecord>;
}
// Only an actual store opened by this module can join a transaction. No JSON capability.
const participants = new WeakMap<object, Participant>();

/** DEV-006 technical adapter. No routes, global connection, defaults or business records.
 * Each operation rechecks current memberships. Membership revocation itself is not
 * serialized with this transaction until production directory integration is designed.
 * Audit/revisions are append-only through this API; production DB roles must enforce it.
 */
export async function openVersionedStore<T>(options: StoreOptions<T>) {
  if (
    !/^[a-z][a-z0-9_]*$/.test(options.namespace) ||
    !idSchema.safeParse(options.kind).success ||
    !idSchema.safeParse(options.schemaVersion).success ||
    !['mutable', 'append-only'].includes(options.mode) ||
    options.readAction === options.writeAction
  )
    fail('INVALID_REQUEST');
  const {
    client,
    schema,
    schemaVersion,
    kind,
    mode,
    memberships,
    clock,
    loadPolicy,
    readAction,
    writeAction,
  } = options;
  let protection: ReturnType<typeof createJsonProtection>;
  try {
    protection = createJsonProtection(options.keys);
  } catch {
    return fail('INVALID_REQUEST');
  }
  const database = options.database;
  const db = client.db(database);
  try {
    const hello = await db.admin().command({ hello: 1 });
    if (
      (!hello.setName && hello.msg !== 'isdbgrid') ||
      hello.logicalSessionTimeoutMinutes === null ||
      hello.logicalSessionTimeoutMinutes === undefined
    )
      fail('TRANSACTIONS_REQUIRED');
  } catch (error) {
    if (error instanceof FoundationStoreError) throw error;
    return fail('STORAGE_UNAVAILABLE');
  }
  const prefix = options.namespace;
  const records = db.collection<Row>(`${prefix}_records`);
  const revisions = db.collection<Revision>(`${prefix}_revisions`);
  const events = db.collection<Event>(`${prefix}_audit`);
  const receipts = db.collection<Receipt>(`${prefix}_receipts`);
  const outbox = db.collection<OutboxDelivery>(`${prefix}_outbox`);
  try {
    await records.createIndex({ 'scope.kind': 1, 'scope.id': 1 });
    await revisions.createIndex({ aggregateId: 1, revision: 1 }, { unique: true });
    await events.createIndex({ aggregateId: 1, revision: 1 }, { unique: true });
    await receipts.createIndex({ aggregateId: 1, revision: 1 });
    await outbox.createIndex({ eventId: 1 }, { unique: true });
    await outbox.createIndex({ state: 1, _id: 1 });
  } catch {
    return fail('STORAGE_UNAVAILABLE');
  }

  function key(id: string): string {
    return createHash('sha256')
      .update(canonicalJson([kind, id]))
      .digest('hex');
  }
  function revisionKey(aggregate: string, revision: number): string {
    return `${aggregate}:${revision}`;
  }
  function binding(
    row: Pick<Row, '_id' | 'scope' | 'schemaVersion' | 'mode' | 'revision' | 'eventId'>,
  ): string {
    return canonicalJson({ database, namespace: prefix, kind, ...row });
  }
  function decode(row: Row): RecordVersion<T> {
    try {
      if (!recordSchema.safeParse(row).success) fail('INTEGRITY_FAILURE');
      if (row.schemaVersion !== schemaVersion) fail('SCHEMA_VERSION_UNSUPPORTED');
      if (row.mode !== mode) fail('RECORD_MODE_MISMATCH');
      const { payload, ...metadata } = row;
      return {
        revision: row.revision,
        eventId: row.eventId,
        payload: schema.parse(protection.open(payload, binding(metadata))),
      };
    } catch (error) {
      if (error instanceof FoundationStoreError) throw error;
      return fail('INTEGRITY_FAILURE');
    }
  }
  async function verified(row: Row, session?: mongo.ClientSession): Promise<RecordVersion<T>> {
    const value = decode(row);
    if (!options.verifyIntegrity) return value;
    try {
      const event = authenticateFoundationEvent(
        await events.findOne({ _id: row.eventId }, { session }),
        protection,
        { database, namespace: prefix, eventId: row.eventId },
      );
      const saved = await revisions.findOne(
        { _id: revisionKey(row._id, row.revision) },
        { session },
      );
      const matches = await receipts.find(
        { aggregateId: row._id, revision: row.revision }, { session },
      ).toArray();
      // Delivery bookkeeping is mutable; require a valid linked queue entry, not its initial bytes.
      const delivery = deliverySchema.parse(await outbox.findOne({ _id: row.eventId }, { session }));
      if (!saved || saved.aggregateId !== row._id) fail('INTEGRITY_FAILURE');
      const { aggregateId, ...savedRow } = saved;
      const savedVersion = decode({ ...savedRow, _id: aggregateId });
      if (matches.length !== 1 ||
          matches[0].aggregateId !== row._id || matches[0].revision !== row.revision ||
          delivery.eventId !== row.eventId || event.aggregateId !== row._id || event.revision !== row.revision ||
          event.kind !== kind || event.schemaVersion !== schemaVersion ||
          event.action !== writeAction || canonicalJson(event.scope) !== canonicalJson(row.scope) ||
          canonicalJson(event.after) !== canonicalJson(value.payload) ||
          canonicalJson(savedVersion.payload) !== canonicalJson(value.payload) ||
          saved.eventId !== row.eventId) fail('INTEGRITY_FAILURE');
      return value;
    } catch {
      return fail('INTEGRITY_FAILURE');
    }
  }
  async function authorize(principal: VerifiedPrincipal, scope: Scope, action: string, ts: string) {
    let policy: unknown;
    try {
      policy = await loadPolicy();
    } catch {
      return fail('IDENTITY_UNAVAILABLE');
    }
    const decision = await authorizeResource(
      { principal, resource: scope, action, policy, now: ts },
      memberships,
    );
    if (!decision.authorized) return fail(decision.code);
    return decision.actor;
  }
  function timestamp(): string {
    try {
      const ts = clock();
      if (!z.string().datetime({ offset: true }).safeParse(ts).success) fail('INVALID_REQUEST');
      return ts;
    } catch {
      return fail('INVALID_REQUEST');
    }
  }
  async function guarded<R>(operation: () => Promise<R>): Promise<R> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof FoundationStoreError) throw error;
      return fail('STORAGE_UNAVAILABLE');
    }
  }

  function prepare(input: WriteRecord) {
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success) fail('INVALID_REQUEST');
    const request = parsed.data;
    let payload: T;
    try {
      const serialized = canonicalJson(schema.parse(request.payload));
      payload = schema.parse(JSON.parse(serialized) as unknown);
      if (canonicalJson(payload) !== serialized) fail('INVALID_RECORD');
    } catch {
      return fail('INVALID_RECORD');
    }
    return {
      request,
      payload,
      aggregate: key(request.id),
      receiptId: key(canonicalJson([request.id, request.commandId])),
      eventId: randomUUID(),
    };
  }
  async function stage(
    principal: VerifiedPrincipal,
    prepared: ReturnType<typeof prepare>,
    session: mongo.ClientSession,
    ts: string,
  ): Promise<PendingRecord<T>> {
    const { request, payload, aggregate, receiptId, eventId } = prepared;
    const current = await records.findOne({ _id: aggregate }, { session });
    const scope = current?.scope ?? request.createScope;
    if (!scope) fail('INVALID_REQUEST');
    const actor = await authorize(principal, scope, writeAction, ts);
    const before = current ? (await verified(current, session)).payload : null;
    if (
      current &&
      request.createScope &&
      canonicalJson(request.createScope) !== canonicalJson(scope)
    )
      fail('AUTH_SCOPE_DENIED');
    const intent = {
      aggregate,
      scope,
      actor,
      expectedRevision: request.expectedRevision,
      payload,
      correlationId: request.correlationId,
      schemaVersion,
      mode,
      action: writeAction,
    };
    function assertWritable() {
      if ((current?.revision ?? 0) !== request.expectedRevision) fail('REVISION_CONFLICT');
      if (current && mode === 'append-only') fail('RECORD_IMMUTABLE');
    }
    async function original(revision: number, expectedEventId?: string): Promise<RecordVersion<T>> {
      if (!current || current.revision < revision) fail('INTEGRITY_FAILURE');
      const saved = await revisions.findOne({ aggregateId: aggregate, revision }, { session });
      if (
        !saved ||
        saved._id !== revisionKey(aggregate, revision) ||
        canonicalJson(saved.scope) !== canonicalJson(scope) ||
        (expectedEventId !== undefined && saved.eventId !== expectedEventId)
      )
        fail('INTEGRITY_FAILURE');
      const { aggregateId, ...version } = saved;
      return verified({ ...version, _id: aggregateId }, session);
    }
    return {
      change: {
        kind,
        id: request.id,
        scope,
        revision: current?.revision ?? 0,
        expectedRevision: request.expectedRevision,
        before,
        after: payload,
      },
      intent,
      assertWritable,
      original,
      async commit(context) {
        const fingerprint = protection.fingerprint(
          context ? { intent, transaction: context } : intent,
        );
        const receipt = await receipts.findOne({ _id: receiptId }, { session });
        if (receipt) {
          if (receipt.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT');
          // A group receipt and all subreceipts must have committed together.
          if (context) fail('INTEGRITY_FAILURE');
          if (
            receipt.aggregateId !== aggregate ||
            receipt.revision !== request.expectedRevision + 1
          )
            fail('INTEGRITY_FAILURE');
          return original(receipt.revision);
        }
        assertWritable();
        const revision = request.expectedRevision + 1;
        const metadata = { _id: aggregate, scope, schemaVersion, mode, revision, eventId };
        const next: Row = { ...metadata, payload: protection.seal(payload, binding(metadata)) };
        if (current) {
          const update = await records.replaceOne(
            { _id: aggregate, revision: request.expectedRevision },
            next,
            { session },
          );
          if (update.matchedCount !== 1) fail('REVISION_CONFLICT');
        } else await records.insertOne(next, { session });
        await revisions.insertOne(
          { ...next, _id: revisionKey(aggregate, revision), aggregateId: aggregate },
          { session },
        );
        const event = {
          event_id: eventId,
          ts,
          actor: actor.userId,
          role: actor.role,
          type: current ? 'foundation.record.updated' : 'foundation.record.created',
          kind,
          action: writeAction,
          membershipId: actor.membershipId,
          scope,
          aggregateId: aggregate,
          revision,
          schemaVersion,
          commandId: request.commandId,
          correlationId: request.correlationId,
          before,
          after: payload,
        };
        await events.insertOne(
          {
            _id: eventId,
            aggregateId: aggregate,
            revision,
            body: protection.seal(
              event,
              canonicalJson({ database, namespace: prefix, eventId, aggregate, revision }),
            ),
          },
          { session },
        );
        await outbox.insertOne(pendingDelivery(eventId, ts), { session });
        await receipts.insertOne(
          { _id: receiptId, aggregateId: aggregate, fingerprint, revision },
          { session },
        );
        return { revision, eventId, payload };
      },
    };
  }

  const store = {
    async read(principal: VerifiedPrincipal, id: string): Promise<RecordVersion<T> | null> {
      if (!idSchema.safeParse(id).success) fail('INVALID_REQUEST');
      return guarded(async () => {
        const row = await records.findOne({ _id: key(id) });
        if (!row) return null;
        await authorize(principal, row.scope, readAction, timestamp());
        return verified(row);
      });
    },
    async history(principal: VerifiedPrincipal, id: string): Promise<RecordVersion<T>[]> {
      if (!idSchema.safeParse(id).success) fail('INVALID_REQUEST');
      return guarded(async () => {
        const session = client.startSession();
        try {
          const result = await session.withTransaction(
            async () => {
              const row = await records.findOne({ _id: key(id) }, { session });
              if (!row) return [];
              await authorize(principal, row.scope, readAction, timestamp());
              // Authenticate ownership and read all revisions from the same database snapshot.
              await verified(row, session);
              const rows = await revisions
                .find({ aggregateId: row._id }, { session })
                .sort({ revision: 1 })
                .toArray();
              if (
                rows.length !== row.revision ||
                rows.some(
                  (version, index) =>
                    version.revision !== index + 1 ||
                    canonicalJson(version.scope) !== canonicalJson(row.scope),
                ) ||
                rows[rows.length - 1]?.eventId !== row.eventId
              )
                fail('INTEGRITY_FAILURE');
              const history: RecordVersion<T>[] = [];
              for (const { aggregateId, ...revision } of rows)
                history.push(await verified({ ...revision, _id: aggregateId }, session));
              return history;
            },
            { readConcern: { level: 'snapshot' }, readPreference: 'primary' },
          );
          return result ?? fail('STORAGE_UNAVAILABLE');
        } finally {
          await session.endSession();
        }
      });
    },
    async write(principal: VerifiedPrincipal, input: WriteRecord): Promise<RecordVersion<T>> {
      const prepared = prepare(input);
      // Duplicate-key races are retried once after abort to read the winning receipt/revision.
      for (let attempt = 0; attempt < 2; attempt++) {
        let session: mongo.ClientSession;
        try {
          session = client.startSession();
        } catch {
          return fail('STORAGE_UNAVAILABLE');
        }
        try {
          const result = await session.withTransaction(
            async () => (await stage(principal, prepared, session, timestamp())).commit(),
            {
              readConcern: { level: 'snapshot' },
              writeConcern: { w: 'majority' },
              readPreference: 'primary',
            },
          );
          if (!result) fail('STORAGE_UNAVAILABLE');
          return result;
        } catch (error) {
          if (error instanceof FoundationStoreError) throw error;
          if (error instanceof mongo.MongoServerError && error.code === 11000 && attempt === 0)
            continue;
          return fail('STORAGE_UNAVAILABLE');
        } finally {
          try {
            await session.endSession();
          } catch {
            fail('STORAGE_UNAVAILABLE');
          }
        }
      }
      return fail('STORAGE_UNAVAILABLE');
    },
  };
  participants.set(store, {
    client,
    database,
    namespace: prefix,
    kind,
    read: async (principal, id, session, ts) => {
      const row = await records.findOne({ _id: key(id) }, { session });
      if (!row) return null;
      await authorize(principal, row.scope, readAction, ts);
      return verified(row, session);
    },
    normalize: (input) => {
      const prepared = prepare(input);
      return { ...prepared.request, payload: prepared.payload };
    },
    stage: (principal, input, session, ts) => stage(principal, prepare(input), session, ts),
  });
  return store;
}

const transactionPolicySchema = z
  .object({
    policyId: idSchema,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    maxRecords: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
const transactionRequestSchema = z
  .object({
    commandId: idSchema,
    correlationId: idSchema,
    changes: z
      .array(
        z
          .object({
            store: z.custom<object>((value) => typeof value === 'object' && value !== null),
            record: commandSchema.omit({ commandId: true, correlationId: true }),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
const resultReferenceSchema = z
  .object({
    kind: idSchema,
    id: idSchema,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    eventId: idSchema,
  })
  .strict();
const transactionReceiptSchema = z
  .object({
    _id: idSchema,
    format: z.literal(1),
    policyId: idSchema,
    policyRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    commandId: idSchema,
    correlationId: idSchema,
    body: z.unknown(),
  })
  .strict();
const transactionBodySchema = z
  .object({
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    records: z.array(resultReferenceSchema).min(1),
    subreceipts: z.array(z.object({ _id: idSchema, aggregateId: idSchema, fingerprint: idSchema, revision: z.number().int().positive() }).strict()).optional(),
  })
  .strict();
interface TransactionReceipt extends Omit<z.infer<typeof transactionReceiptSchema>, 'body'> {
  body: EncryptedJson;
}
export interface RecordTransactionOptions {
  verifyIntegrity?: boolean;
  client: mongo.MongoClient;
  database: string;
  namespace: string;
  keys: StorageKeys;
  clock(): string;
  policy: z.infer<typeof transactionPolicySchema>;
  /** Pure synchronous server-installed guard. No IO, provider calls or mutations. */
  validate(changes: readonly RecordChange[]): boolean;
}
export interface RecordTransactionRequest {
  commandId: string;
  correlationId: string;
  changes: Array<{ store: object; record: Omit<WriteRecord, 'commandId' | 'correlationId'> }>;
}
export interface RecordTransactionResult {
  commandId: string;
  records: Array<RecordVersion<unknown> & { kind: string; id: string }>;
}
export interface RecordTransactionSnapshot {
  records: Array<{ kind: string; id: string; record: RecordVersion<unknown> | null }>;
}
function hashStorageKey(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
function freezeJson(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
}

/** Atomic technical coordinator across stores opened by this module.
 * The configured guard must enforce domain relationships/invariants; none are inferred.
 * All memberships are refreshed, but their revocation is not serialized in this session.
 */
export async function openRecordTransaction(options: RecordTransactionOptions) {
  const policyResult = transactionPolicySchema.safeParse(options.policy);
  if (
    !policyResult.success ||
    typeof options.validate !== 'function' ||
    !/^[a-z][a-z0-9_]*$/.test(options.namespace) ||
    !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(options.database)
  )
    fail('INVALID_REQUEST');
  const { client, database, namespace, clock, validate } = options;
  const policy = policyResult.data;
  let protection: ReturnType<typeof createJsonProtection>;
  try {
    protection = createJsonProtection(options.keys);
  } catch {
    return fail('INVALID_REQUEST');
  }
  const db = client.db(database);
  const receipts = db.collection<TransactionReceipt>(`${namespace}_transaction_receipts`);
  async function guarded<R>(operation: () => Promise<R>): Promise<R> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof FoundationStoreError) throw error;
      return fail('STORAGE_UNAVAILABLE');
    }
  }
  await guarded(async () => {
    const hello = await db.admin().command({ hello: 1 });
    if (
      (!hello.setName && hello.msg !== 'isdbgrid') ||
      hello.logicalSessionTimeoutMinutes === null ||
      hello.logicalSessionTimeoutMinutes === undefined
    )
      fail('TRANSACTIONS_REQUIRED');
    await receipts.createIndex({ policyId: 1, commandId: 1 }, { unique: true });
  });
  function timestamp(): string {
    try {
      return z.string().datetime({ offset: true }).parse(clock());
    } catch {
      return fail('INVALID_REQUEST');
    }
  }
  function binding(metadata: unknown): string {
    return canonicalJson({ database, namespace, type: 'record-transaction-receipt', metadata });
  }
  async function verifySubreceipts(body: z.infer<typeof transactionBodySchema>, session: mongo.ClientSession) {
    if (!options.verifyIntegrity) return;
    if (!body.subreceipts || body.subreceipts.length !== body.records.length) fail('INTEGRITY_FAILURE');
    for (const expected of body.subreceipts) {
      const actual = await db.collection<Receipt>(`${namespace}_receipts`).findOne({ _id: expected._id }, { session });
      if (canonicalJson(actual) !== canonicalJson(expected)) fail('INTEGRITY_FAILURE');
    }
  }
  return {
    async read(
      principal: VerifiedPrincipal,
      targets: Array<{ store: object; id: string }>,
      committed?: { commandId: string; correlationId: string },
    ): Promise<RecordTransactionSnapshot> {
      const parsed = z
        .array(
          z
            .object({
              store: z.custom<object>((value) => typeof value === 'object' && value !== null),
              id: idSchema,
            })
            .strict(),
        )
        .min(1)
        .safeParse(targets);
      if (!parsed.success) fail('INVALID_REQUEST');
      if (parsed.data.length > policy.maxRecords) fail('BATCH_LIMIT_EXCEEDED');
      const entries = parsed.data
        .map(({ store, id }) => {
          const port = participants.get(store);
          if (
            !port ||
            port.client !== client ||
            port.database !== database ||
            port.namespace !== namespace
          )
            return fail('INVALID_REQUEST');
          return { port, id, identity: canonicalJson([port.kind, id]) };
        })
        .sort((a, b) => (a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0));
      if (new Set(entries.map((entry) => entry.identity)).size !== entries.length)
        fail('INVALID_REQUEST');
      return guarded(async () => {
        const session = client.startSession();
        try {
          const result = await session.withTransaction(
            async (): Promise<RecordTransactionSnapshot> => {
              const ts = timestamp();
              const records: RecordTransactionSnapshot['records'] = [];
              for (const entry of entries)
                records.push({
                  kind: entry.port.kind,
                  id: entry.id,
                  record: await entry.port.read(principal, entry.id, session, ts),
                });
              if (committed) {
                try {
                  const row = transactionReceiptSchema.parse(await receipts.findOne(
                    { _id: hashStorageKey([policy.policyId, committed.commandId]) }, { session },
                  ));
                  const { body: ciphertext, ...metadata } = row;
                  const body = transactionBodySchema.parse(protection.open(ciphertext, binding(metadata)));
                  await verifySubreceipts(body, session);
                  const refs = records.map(({ kind, id, record }) => {
                    if (!record) return fail('INTEGRITY_FAILURE');
                    return { kind, id, revision: record.revision, eventId: record.eventId };
                  });
                  if (row.policyId !== policy.policyId || row.policyRevision !== policy.revision ||
                      row.commandId !== committed.commandId || row.correlationId !== committed.correlationId ||
                      canonicalJson(body.records) !== canonicalJson(refs)) fail('INTEGRITY_FAILURE');
                } catch { return fail('INTEGRITY_FAILURE'); }
              }
              return { records };
            },
            { readConcern: { level: 'snapshot' }, readPreference: 'primary' },
          );
          return result ?? fail('STORAGE_UNAVAILABLE');
        } finally {
          await session.endSession();
        }
      });
    },
    async write(
      principal: VerifiedPrincipal,
      input: RecordTransactionRequest,
    ): Promise<RecordTransactionResult> {
      const parsed = transactionRequestSchema.safeParse(input);
      if (!parsed.success) fail('INVALID_REQUEST');
      const request = parsed.data;
      if (request.changes.length > policy.maxRecords) fail('BATCH_LIMIT_EXCEEDED');
      // Normalize and detach all payloads synchronously before asynchronous lookups/retries.
      const changes = request.changes
        .map(({ store, record }) => {
          const port = participants.get(store);
          if (
            !port ||
            port.client !== client ||
            port.database !== database ||
            port.namespace !== namespace
          )
            return fail('INVALID_REQUEST');
          const identity = canonicalJson([port.kind, record.id]);
          const commandId = `transaction:${hashStorageKey([policy.policyId, request.commandId, port.kind, record.id])}`;
          return {
            port,
            identity,
            input: port.normalize({
              ...record,
              payload: record.payload,
              commandId,
              correlationId: request.correlationId,
            }),
          };
        })
        .sort((a, b) => (a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0));
      if (new Set(changes.map((change) => change.identity)).size !== changes.length)
        fail('INVALID_REQUEST');
      const receiptId = hashStorageKey([policy.policyId, request.commandId]);
      const metadata = {
        _id: receiptId,
        format: 1 as const,
        policyId: policy.policyId,
        policyRevision: policy.revision,
        commandId: request.commandId,
        correlationId: request.correlationId,
      };
      return guarded(async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          const session = client.startSession();
          try {
            const result = await session.withTransaction(
              async (): Promise<RecordTransactionResult> => {
                const ts = timestamp();
                const pending: PendingRecord[] = [];
                for (const change of changes)
                  pending.push(await change.port.stage(principal, change.input, session, ts));
                const fingerprint = protection.fingerprint({
                  policy,
                  commandId: request.commandId,
                  correlationId: request.correlationId,
                  intents: pending.map((item) => item.intent),
                });
                const receipt = await receipts.findOne({ _id: receiptId }, { session });
                if (receipt) {
                  let body: z.infer<typeof transactionBodySchema>;
                  try {
                    const parsedReceipt = transactionReceiptSchema.parse(receipt);
                    const { body: ciphertext, ...savedMetadata } = parsedReceipt;
                    body = transactionBodySchema.parse(
                      protection.open(ciphertext, binding(savedMetadata)),
                    );
                    await verifySubreceipts(body, session);
                    if (body.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT');
                    if (
                      canonicalJson(savedMetadata) !== canonicalJson(metadata) ||
                      body.records.length !== pending.length
                    )
                      fail('INTEGRITY_FAILURE');
                  } catch (error) {
                    if (error instanceof FoundationStoreError) throw error;
                    return fail('INTEGRITY_FAILURE');
                  }
                  const records: RecordTransactionResult['records'] = [];
                  for (let index = 0; index < pending.length; index++) {
                    const item = pending[index];
                    const ref = body.records[index];
                    if (
                      ref.kind !== item.change.kind ||
                      ref.id !== item.change.id ||
                      ref.revision !== item.change.expectedRevision + 1
                    )
                      fail('INTEGRITY_FAILURE');
                    records.push({
                      kind: ref.kind,
                      id: ref.id,
                      ...(await item.original(ref.revision, ref.eventId)),
                    });
                  }
                  return { commandId: request.commandId, records };
                }
                for (const item of pending) item.assertWritable();
                const detached = z
                  .array(changeSchema)
                  .parse(JSON.parse(canonicalJson(pending.map((item) => item.change))) as unknown);
                freezeJson(detached);
                try {
                  if (validate(detached) !== true) fail('RULE_DENIED');
                } catch {
                  return fail('RULE_DENIED');
                }
                const records: RecordTransactionResult['records'] = [];
                for (const item of pending)
                  records.push({
                    kind: item.change.kind,
                    id: item.change.id,
                    ...(await item.commit({ receiptId, fingerprint })),
                  });
                const refs = records.map(({ kind, id, revision, eventId }) => ({
                  kind,
                  id,
                  revision,
                  eventId,
                }));
                const subreceipts: Receipt[] = [];
                for (const change of changes) {
                  const receipt = await db.collection<Receipt>(`${namespace}_receipts`).findOne({
                    _id: hashStorageKey([change.port.kind, canonicalJson([change.input.id, change.input.commandId])]),
                  }, { session });
                  if (!receipt) fail('INTEGRITY_FAILURE');
                  subreceipts.push(receipt);
                }
                await receipts.insertOne(
                  {
                    ...metadata,
                    body: protection.seal({ fingerprint, records: refs, subreceipts }, binding(metadata)),
                  },
                  { session },
                );
                return { commandId: request.commandId, records };
              },
              {
                readConcern: { level: 'snapshot' },
                writeConcern: { w: 'majority' },
                readPreference: 'primary',
              },
            );
            return result ?? fail('STORAGE_UNAVAILABLE');
          } catch (error) {
            if (error instanceof mongo.MongoServerError && error.code === 11000 && attempt === 0)
              continue;
            throw error;
          } finally {
            await session.endSession();
          }
        }
        return fail('STORAGE_UNAVAILABLE');
      });
    },
  };
}
