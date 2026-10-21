import { createHash, randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { z } from 'zod';
import {
  canonicalJson,
  createJsonProtection,
  type EncryptedJson,
  type StorageKeys,
} from './encrypted-json';
import {
  authenticateFoundationEvent,
  type FoundationEvent,
  type StoredFoundationEvent,
} from './foundation-event';
import { authorizeResource, type MembershipDirectory, type VerifiedPrincipal } from './identity';
import type { OutboxMessage } from './outbox';

const id = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value && !value.includes('\0'));
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const time = z.string().datetime({ offset: true });
const scopeSchema = z
  .object({ kind: z.enum(['customer', 'organization', 'partner']), id })
  .strict();
const rowSchema = z
  .object({
    _id: id,
    projectionId: id,
    aggregateId: id,
    kind: id,
    schemaVersion: id,
    scope: scopeSchema,
    revision,
    eventId: id,
    body: z.unknown(),
  })
  .strict();
const receiptSchema = z
  .object({ _id: id, projectionId: id, aggregateId: id, revision, eventId: id, body: z.unknown() })
  .strict();
const receiptBodySchema = z
  .object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/), occurredAt: time, receivedAt: time })
  .strict();
const snapshotBodySchema = z
  .object({ payload: z.unknown(), occurredAt: time, receivedAt: time })
  .strict()
  .refine((body) => 'payload' in body);
interface Row extends Omit<z.infer<typeof rowSchema>, 'body'> {
  body: EncryptedJson;
}
interface Receipt extends Omit<z.infer<typeof receiptSchema>, 'body'> {
  body: EncryptedJson;
}
interface Journal {
  _id: string;
  projectionId: string;
  aggregateId: string;
  revision: number;
  sourceEventId: string;
  body: EncryptedJson;
}
type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_CONFIGURATION'
  | 'TRANSACTIONS_REQUIRED'
  | 'STORAGE_UNAVAILABLE'
  | 'INTEGRITY_FAILURE'
  | 'EVENT_INVALID'
  | 'EVENT_UNSUPPORTED'
  | 'EVENT_CONFLICT'
  | 'CHAIN_CONFLICT'
  | 'SCOPE_CONFLICT'
  | 'REVISION_GAP'
  | 'AUTH_SCOPE_DENIED'
  | 'POLICY_INVALID'
  | 'IDENTITY_UNAVAILABLE';
export class ProjectionError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'ProjectionError';
  }
}
function fail(code: ErrorCode): never {
  throw new ProjectionError(code);
}
export interface ProjectionOptions<T> {
  client: mongo.MongoClient;
  database: string;
  namespace: string;
  projectionId: string;
  kind: string;
  schemaVersion: string;
  schema: z.ZodType<T>;
  keys: StorageKeys;
  clock(): string;
  memberships: MembershipDirectory;
  loadPolicy(): Promise<unknown>;
  readAction: string;
}
export interface ProjectionSnapshot<T> {
  revision: number;
  eventId: string;
  payload: T;
  occurredAt: string;
  receivedAt: string;
}
export type ProjectionResult =
  | { status: 'applied' | 'duplicate' | 'stale'; eventId: string; revision: number }
  | { status: 'gap'; eventId: string; revision: number; expectedRevision: number };

/** Derived encrypted mirror of an authenticated canonical source snapshot.
 * No custom reducer, authoritative business state, HTTP route or external provider.
 * Apply/handle are trusted server ports; reads still require current scoped identity.
 */
export async function openSnapshotProjection<T>(options: ProjectionOptions<T>) {
  if (
    !/^[a-z][a-z0-9_]*$/.test(options.namespace) ||
    !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(options.database) ||
    ![options.projectionId, options.kind, options.schemaVersion].every(
      (value) => id.safeParse(value).success,
    )
  )
    fail('INVALID_CONFIGURATION');
  const {
    client,
    database,
    namespace,
    projectionId,
    kind,
    schemaVersion,
    schema,
    clock,
    memberships,
    loadPolicy,
    readAction,
  } = options;
  let protection: ReturnType<typeof createJsonProtection>;
  try {
    protection = createJsonProtection(options.keys);
  } catch {
    return fail('INVALID_CONFIGURATION');
  }
  const db = client.db(database);
  const records = db.collection<Row>(`${namespace}_projection_records`);
  const receipts = db.collection<Receipt>(`${namespace}_projection_receipts`);
  const journal = db.collection<Journal>(`${namespace}_projection_audit`);
  const events = db.collection<StoredFoundationEvent>(`${namespace}_audit`);
  async function guarded<R>(operation: () => Promise<R>): Promise<R> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ProjectionError) throw error;
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
    await records.createIndex({ projectionId: 1, aggregateId: 1 }, { unique: true });
    await receipts.createIndex({ projectionId: 1, eventId: 1 }, { unique: true });
    await journal.createIndex({ projectionId: 1, aggregateId: 1, revision: 1 }, { unique: true });
  });
  function hash(value: unknown): string {
    return createHash('sha256').update(canonicalJson(value)).digest('hex');
  }
  function recordId(aggregateId: string): string {
    return hash([projectionId, aggregateId]);
  }
  function binding(type: 'record' | 'receipt' | 'audit', metadata: unknown): string {
    return canonicalJson({ database, namespace, projectionId, type, metadata });
  }
  function timestamp(): string {
    try {
      return time.parse(clock());
    } catch {
      return fail('INVALID_REQUEST');
    }
  }
  function validatePayload(value: unknown, code: 'EVENT_INVALID' | 'INTEGRITY_FAILURE'): T {
    try {
      const parsed = schema.parse(value);
      if (canonicalJson(parsed) !== canonicalJson(value)) fail(code);
      return parsed;
    } catch {
      return fail(code);
    }
  }
  function decode(raw: unknown): ProjectionSnapshot<T> {
    try {
      const row = rowSchema.parse(raw);
      if (
        row.projectionId !== projectionId ||
        row.kind !== kind ||
        row.schemaVersion !== schemaVersion ||
        row._id !== recordId(row.aggregateId)
      )
        fail('INTEGRITY_FAILURE');
      const { body, ...metadata } = row;
      const content = snapshotBodySchema.parse(protection.open(body, binding('record', metadata)));
      return {
        revision: row.revision,
        eventId: row.eventId,
        payload: validatePayload(content.payload, 'INTEGRITY_FAILURE'),
        occurredAt: content.occurredAt,
        receivedAt: content.receivedAt,
      };
    } catch (error) {
      if (error instanceof ProjectionError) throw error;
      return fail('INTEGRITY_FAILURE');
    }
  }
  async function authorize(principal: VerifiedPrincipal, scope: unknown) {
    let policy: unknown;
    try {
      policy = await loadPolicy();
    } catch {
      return fail('IDENTITY_UNAVAILABLE');
    }
    const decision = await authorizeResource(
      { principal, resource: scope, action: readAction, policy, now: timestamp() },
      memberships,
    );
    if (!decision.authorized) fail(decision.code);
  }

  async function apply(eventId: string): Promise<ProjectionResult> {
    if (!id.safeParse(eventId).success) fail('INVALID_REQUEST');
    const receivedAt = timestamp();
    return guarded(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const session = client.startSession();
        try {
          const result = await session.withTransaction(
            async (): Promise<ProjectionResult> => {
              const source = await events.findOne({ _id: eventId }, { session });
              let event: FoundationEvent;
              try {
                event = authenticateFoundationEvent(source, protection, {
                  database,
                  namespace,
                  eventId,
                });
              } catch {
                return fail('EVENT_INVALID');
              }
              if (event.kind !== kind || event.schemaVersion !== schemaVersion)
                fail('EVENT_UNSUPPORTED');
              const payload = validatePayload(event.after, 'EVENT_INVALID');
              const current = await records.findOne(
                { _id: recordId(event.aggregateId) },
                { session },
              );
              const previous = current ? decode(current) : null;
              if (current && canonicalJson(current.scope) !== canonicalJson(event.scope))
                fail('SCOPE_CONFLICT');
              const fingerprint = protection.fingerprint(event);
              const receiptId = hash([projectionId, eventId]);
              const receipt = await receipts.findOne({ _id: receiptId }, { session });
              if (receipt) {
                try {
                  const parsed = receiptSchema.parse(receipt);
                  const { body, ...metadata } = parsed;
                  if (
                    parsed.projectionId !== projectionId ||
                    parsed.eventId !== eventId ||
                    parsed.aggregateId !== event.aggregateId ||
                    parsed.revision !== event.revision ||
                    parsed._id !== receiptId
                  )
                    fail('INTEGRITY_FAILURE');
                  const content = receiptBodySchema.parse(
                    protection.open(body, binding('receipt', metadata)),
                  );
                  if (content.fingerprint !== fingerprint) fail('EVENT_CONFLICT');
                  if (!current || current.revision < event.revision) fail('INTEGRITY_FAILURE');
                } catch (error) {
                  if (error instanceof ProjectionError) throw error;
                  return fail('INTEGRITY_FAILURE');
                }
                return { status: 'duplicate', eventId, revision: event.revision };
              }
              if (previous && event.revision <= previous.revision)
                return { status: 'stale', eventId, revision: event.revision };
              const expectedRevision = previous ? previous.revision + 1 : 1;
              if (event.revision !== expectedRevision)
                return { status: 'gap', eventId, revision: event.revision, expectedRevision };
              if (previous && canonicalJson(event.before) !== canonicalJson(previous.payload))
                fail('CHAIN_CONFLICT');
              const metadata = {
                _id: recordId(event.aggregateId),
                projectionId,
                aggregateId: event.aggregateId,
                kind,
                schemaVersion,
                scope: event.scope,
                revision: event.revision,
                eventId,
              };
              const next: Row = {
                ...metadata,
                body: protection.seal(
                  { payload, occurredAt: event.ts, receivedAt },
                  binding('record', metadata),
                ),
              };
              if (current) {
                const update = await records.replaceOne(
                  { _id: current._id, revision: current.revision },
                  next,
                  { session },
                );
                if (update.matchedCount !== 1) fail('INTEGRITY_FAILURE');
              } else await records.insertOne(next, { session });
              const receiptMetadata = {
                _id: receiptId,
                projectionId,
                aggregateId: event.aggregateId,
                revision: event.revision,
                eventId,
              };
              await receipts.insertOne(
                {
                  ...receiptMetadata,
                  body: protection.seal(
                    { fingerprint, occurredAt: event.ts, receivedAt },
                    binding('receipt', receiptMetadata),
                  ),
                },
                { session },
              );
              const auditMetadata = {
                _id: randomUUID(),
                projectionId,
                aggregateId: event.aggregateId,
                revision: event.revision,
                sourceEventId: eventId,
              };
              await journal.insertOne(
                {
                  ...auditMetadata,
                  body: protection.seal(
                    {
                      actor: projectionId,
                      role: 'projector',
                      kind,
                      schemaVersion,
                      ts: receivedAt,
                      occurredAt: event.ts,
                      receivedAt,
                      sourceActor: event.actor,
                      sourceRole: event.role,
                      scope: event.scope,
                      before: previous?.payload ?? null,
                      after: payload,
                    },
                    binding('audit', auditMetadata),
                  ),
                },
                { session },
              );
              return { status: 'applied', eventId, revision: event.revision };
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
  }
  return {
    apply,
    async handle(message: OutboxMessage): Promise<void> {
      // Reload the authenticated source; callback payload/timestamps never become authoritative.
      const result = await apply(message.eventId);
      if (result.status === 'gap') fail('REVISION_GAP');
    },
    async read(
      principal: VerifiedPrincipal,
      sourceId: string,
    ): Promise<ProjectionSnapshot<T> | null> {
      if (!id.safeParse(sourceId).success) fail('INVALID_REQUEST');
      return guarded(async () => {
        const row = await records.findOne(
          { _id: recordId(hash([kind, sourceId])) },
          { readPreference: 'primary', readConcern: { level: 'majority' } },
        );
        if (!row) return null;
        await authorize(principal, row.scope);
        return decode(row);
      });
    },
  };
}
