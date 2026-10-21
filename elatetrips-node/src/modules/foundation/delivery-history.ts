import { mongo } from 'mongoose';
import { z } from 'zod';
import { canonicalJson, createJsonProtection, type StorageKeys } from './encrypted-json';
import { authenticateFoundationEvent, type StoredFoundationEvent } from './foundation-event';
import { authorizeResource, type MembershipDirectory, type VerifiedPrincipal } from './identity';
import {
  deliverySchema,
  deliverySnapshot,
  pendingDelivery,
  type DeliverySnapshot,
  type OutboxDelivery,
} from './outbox-record';

const id = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value && !value.includes('\0'));
const integer = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER - 1);
const instant = z.string().datetime({ offset: true });
export const historyPolicySchema = z
  .object({
    policyId: id,
    revision: integer.positive(),
    // MongoDB cursor limits are signed 32-bit; leave room for duplicate detection.
    maxPageSize: integer.positive().max(2_147_483_646),
  })
  .strict();
export type HistoryPolicy = z.infer<typeof historyPolicySchema>;
const requestSchema = z
  .object({
    eventId: id,
    limit: integer.positive(),
    includeDetails: z.boolean(),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict();
export type HistoryRequest = z.infer<typeof requestSchema>;

const snapshotSchema = deliverySchema.innerType().omit({ leaseToken: true });
const serializedSnapshotSchema = snapshotSchema.extend({
  availableAt: instant,
  leaseUntil: instant.nullable(),
  deliveredAt: instant.nullable(),
});
const commonJournal = z.object({
  _id: id,
  eventId: id,
  version: integer.positive(),
  ts: z.date(),
  policyId: id,
  policyRevision: integer.positive(),
  actor: id,
  before: snapshotSchema,
  after: snapshotSchema,
});
const journalSchema = z.union([
  commonJournal
    .extend({
      role: z.literal('worker'),
      reason: z.enum([
        'claimed',
        'reclaimed',
        'delivered',
        'retry_scheduled',
        'attempts_exhausted',
        'invalid_event',
      ]),
    })
    .strict(),
  commonJournal
    .extend({
      role: z.literal('worker'),
      reason: z.literal('lease_renewed'),
      renewalPolicyId: id,
      renewalPolicyRevision: integer.positive(),
    })
    .strict(),
  commonJournal
    .extend({
      role: z.enum(['customer', 'organizer', 'sales', 'ops', 'admin', 'partner', 'adapter']),
      reason: z.literal('operator_retry'),
      membershipId: id,
      reasonCode: z.string().regex(/^[a-z][a-z0-9_]*$/),
    })
    .strict(),
]);
type Journal = z.infer<typeof journalSchema>;
const cursorSchema = z
  .object({
    format: z.literal(1),
    eventId: id,
    userId: id,
    policy: historyPolicySchema,
    includeDetails: z.boolean(),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    watermark: serializedSnapshotSchema,
    previous: serializedSnapshotSchema,
  })
  .strict();

type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_CONFIGURATION'
  | 'INVALID_CURSOR'
  | 'TRANSACTIONS_REQUIRED'
  | 'STORAGE_UNAVAILABLE'
  | 'EVENT_INVALID'
  | 'INTEGRITY_FAILURE'
  | 'AUTH_SCOPE_DENIED'
  | 'POLICY_INVALID'
  | 'IDENTITY_UNAVAILABLE';
export class DeliveryHistoryError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'DeliveryHistoryError';
  }
}
function fail(code: ErrorCode): never {
  throw new DeliveryHistoryError(code);
}
export interface HistoryOptions {
  client: mongo.MongoClient;
  database: string;
  namespace: string;
  keys: StorageKeys;
  clock(): string;
  policy: HistoryPolicy;
  memberships: MembershipDirectory;
  loadPolicy(): Promise<unknown>;
}
export interface HistoryState {
  state: DeliverySnapshot['state'];
  version: number;
  attempts: number;
  totalAttempts: number;
  recoveryCount: number;
  availableAt: string;
  leaseUntil: string | null;
  deliveredAt: string | null;
  lastError: DeliverySnapshot['lastError'];
}
export interface HistoryEntry {
  version: number;
  timestamp: string;
  reason: Journal['reason'];
  before: HistoryState;
  after: HistoryState;
  details?: {
    actor: string;
    role: string;
    policyId: string;
    policyRevision: number;
    membershipId?: string;
    reasonCode?: string;
    renewalPolicyId?: string;
    renewalPolicyRevision?: number;
  };
}
export interface HistoryPage {
  eventId: string;
  watermarkVersion: number;
  entries: HistoryEntry[];
  nextCursor: string | null;
}
function wire(row: DeliverySnapshot) {
  return {
    ...row,
    availableAt: row.availableAt.toISOString(),
    leaseUntil: row.leaseUntil?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
  };
}
function checkedSnapshot(value: unknown): DeliverySnapshot {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) fail('INTEGRITY_FAILURE');
  const validated = deliverySchema.safeParse({
    ...parsed.data,
    leaseToken: parsed.data.state === 'leased' ? 'structural-check-only' : null,
  });
  if (!validated.success) fail('INTEGRITY_FAILURE');
  return deliverySnapshot(validated.data);
}
function unwire(value: z.infer<typeof serializedSnapshotSchema>) {
  return checkedSnapshot({
    ...value,
    availableAt: new Date(value.availableAt),
    leaseUntil: value.leaseUntil === null ? null : new Date(value.leaseUntil),
    deliveredAt: value.deliveredAt === null ? null : new Date(value.deliveredAt),
  });
}
function equal(a: DeliverySnapshot, b: DeliverySnapshot) {
  return canonicalJson(wire(a)) === canonicalJson(wire(b));
}
function publicState(row: DeliverySnapshot): HistoryState {
  const {
    state,
    version,
    attempts,
    totalAttempts,
    recoveryCount,
    availableAt,
    leaseUntil,
    deliveredAt,
    lastError,
  } = wire(row);
  return {
    state,
    version,
    attempts,
    totalAttempts,
    recoveryCount,
    availableAt,
    leaseUntil,
    deliveredAt,
    lastError,
  };
}
function checkedJournal(value: unknown, eventId: string): Journal {
  const parsed = journalSchema.safeParse(value);
  if (!parsed.success) fail('INTEGRITY_FAILURE');
  const row = parsed.data;
  const before = checkedSnapshot(row.before);
  const after = checkedSnapshot(row.after);
  if (
    row.eventId !== eventId ||
    before.eventId !== eventId ||
    after.eventId !== eventId ||
    row.version !== after.version ||
    before.version + 1 !== after.version
  )
    fail('INTEGRITY_FAILURE');
  let expected: DeliverySnapshot = { ...before, version: after.version };
  const cleared = { leaseUntil: null, workerId: null, deliveredAt: null };
  switch (row.reason) {
    case 'claimed':
    case 'reclaimed':
      if (
        before.state !== (row.reason === 'claimed' ? 'pending' : 'leased') ||
        before.availableAt.getTime() > row.ts.getTime() ||
        (row.reason === 'reclaimed' &&
          (before.leaseUntil?.getTime() ?? Infinity) > row.ts.getTime()) ||
        (after.leaseUntil?.getTime() ?? 0) <= row.ts.getTime()
      )
        fail('INTEGRITY_FAILURE');
      expected = {
        ...expected,
        state: 'leased',
        attempts: before.attempts + 1,
        totalAttempts: before.totalAttempts + 1,
        leaseUntil: after.leaseUntil,
        workerId: row.actor,
      };
      break;
    case 'lease_renewed':
      if (
        before.state !== 'leased' ||
        before.workerId !== row.actor ||
        (before.leaseUntil?.getTime() ?? 0) <= row.ts.getTime() ||
        (after.leaseUntil?.getTime() ?? 0) <= (before.leaseUntil?.getTime() ?? Infinity)
      )
        fail('INTEGRITY_FAILURE');
      expected = { ...expected, leaseUntil: after.leaseUntil };
      break;
    case 'operator_retry':
      if (before.state !== 'dead' || after.availableAt.getTime() < row.ts.getTime())
        fail('INTEGRITY_FAILURE');
      expected = {
        ...expected,
        ...cleared,
        state: 'pending',
        attempts: 0,
        recoveryCount: before.recoveryCount + 1,
        availableAt: after.availableAt,
      };
      break;
    case 'retry_scheduled':
    case 'invalid_event':
    case 'delivered':
      if (
        before.state !== 'leased' ||
        before.workerId !== row.actor ||
        (before.leaseUntil?.getTime() ?? 0) <= row.ts.getTime()
      )
        fail('INTEGRITY_FAILURE');
      if (row.reason === 'retry_scheduled' && after.availableAt.getTime() < row.ts.getTime())
        fail('INTEGRITY_FAILURE');
      expected = {
        ...expected,
        ...cleared,
        state:
          row.reason === 'delivered'
            ? 'delivered'
            : row.reason === 'invalid_event'
              ? 'dead'
              : 'pending',
        lastError:
          row.reason === 'delivered'
            ? null
            : row.reason === 'invalid_event'
              ? 'INVALID_EVENT'
              : 'DELIVERY_FAILED',
        deliveredAt: row.reason === 'delivered' ? row.ts : null,
        availableAt: row.reason === 'retry_scheduled' ? after.availableAt : before.availableAt,
      };
      break;
    case 'attempts_exhausted':
      if (before.state !== 'pending' && before.state !== 'leased') fail('INTEGRITY_FAILURE');
      expected = {
        ...expected,
        ...cleared,
        state: 'dead',
        lastError:
          before.state === 'leased' &&
          (before.leaseUntil?.getTime() ?? Infinity) <= row.ts.getTime()
            ? 'LEASE_EXPIRED'
            : 'DELIVERY_FAILED',
      };
      // A pending row can retain a previous invalid-event failure after an operator retry.
      if (before.state === 'pending') expected.lastError = before.lastError ?? 'DELIVERY_FAILED';
      if (
        before.state === 'leased' &&
        (before.leaseUntil?.getTime() ?? 0) > row.ts.getTime() &&
        before.workerId !== row.actor
      )
        fail('INTEGRITY_FAILURE');
      break;
  }
  if (!equal(expected, after)) fail('INTEGRITY_FAILURE');
  return row;
}

/** Read-only local port. Source AEAD is authenticated; journal checks are structural. */
export async function openDeliveryHistory(options: HistoryOptions) {
  const parsed = historyPolicySchema.safeParse(options.policy);
  if (
    !parsed.success ||
    !/^[a-z][a-z0-9_]*$/.test(options.namespace) ||
    !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(options.database)
  )
    fail('INVALID_CONFIGURATION');
  const policy = parsed.data;
  const { client, database, namespace } = options;
  let protection: ReturnType<typeof createJsonProtection>;
  try {
    protection = createJsonProtection(options.keys);
  } catch {
    return fail('INVALID_CONFIGURATION');
  }
  const db = client.db(database);
  const queue = db.collection<OutboxDelivery>(`${namespace}_outbox`);
  const events = db.collection<StoredFoundationEvent>(`${namespace}_audit`);
  const journal = db.collection(`${namespace}_delivery_audit`);
  const binding = canonicalJson({
    database,
    namespace,
    type: 'delivery-history-cursor',
    format: 1,
  });
  async function guarded<R>(operation: () => Promise<R>): Promise<R> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DeliveryHistoryError) throw error;
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
  });
  async function authorize(
    principal: VerifiedPrincipal,
    scope: unknown,
    action: 'delivery.history.read' | 'delivery.history.details',
  ) {
    let permission: unknown;
    try {
      permission = await options.loadPolicy();
    } catch {
      return fail('IDENTITY_UNAVAILABLE');
    }
    let now: string;
    try {
      now = instant.parse(options.clock());
    } catch {
      return fail('INVALID_REQUEST');
    }
    const decision = await authorizeResource(
      { principal, resource: scope, action, policy: permission, now },
      options.memberships,
    );
    if (!decision.authorized) fail(decision.code);
  }
  return {
    async read(principal: VerifiedPrincipal, input: HistoryRequest): Promise<HistoryPage | null> {
      const parsed = requestSchema.safeParse(input);
      if (!parsed.success || parsed.data.limit > policy.maxPageSize) fail('INVALID_REQUEST');
      const request = parsed.data;
      return guarded(async () => {
        const session = client.startSession();
        try {
          const result = await session.withTransaction(
            async () => {
              const stored = await events.findOne({ _id: request.eventId }, { session });
              if (!stored) {
                if (await queue.findOne({ _id: request.eventId }, { session }))
                  fail('EVENT_INVALID');
                return null;
              }
              let event;
              try {
                event = authenticateFoundationEvent(stored, protection, {
                  database,
                  namespace,
                  eventId: request.eventId,
                });
              } catch {
                return fail('EVENT_INVALID');
              }
              await authorize(principal, event.scope, 'delivery.history.read');
              if (request.includeDetails)
                await authorize(principal, event.scope, 'delivery.history.details');
              const found = await queue.findOne({ _id: request.eventId }, { session });
              const parsedQueue = deliverySchema.safeParse(found);
              if (!parsedQueue.success) fail('INTEGRITY_FAILURE');
              const current = deliverySnapshot(parsedQueue.data);
              const initial = deliverySnapshot(pendingDelivery(request.eventId, event.ts));
              // Queue and latest journal anchor are observed in the same Mongo snapshot.
              if (current.version === 0) {
                if (!equal(current, initial)) fail('INTEGRITY_FAILURE');
              } else {
                const latest = await journal
                  .find({ eventId: request.eventId, version: current.version }, { session })
                  .limit(2)
                  .toArray();
                if (
                  latest.length !== 1 ||
                  !equal(checkedJournal(latest[0], request.eventId).after, current)
                )
                  fail('INTEGRITY_FAILURE');
              }
              if (
                await journal.findOne(
                  {
                    eventId: request.eventId,
                    $or: [{ version: { $gt: current.version } }, { version: { $lte: 0 } }],
                  },
                  { session },
                )
              )
                fail('INTEGRITY_FAILURE');
              const sourceFingerprint = protection.fingerprint(event);
              let watermark = current;
              let previous = initial;
              if (request.cursor !== undefined) {
                try {
                  if (
                    Buffer.from(request.cursor, 'base64url').toString('base64url') !==
                    request.cursor
                  )
                    fail('INVALID_CURSOR');
                  const decoded: unknown = JSON.parse(
                    Buffer.from(request.cursor, 'base64url').toString('utf8'),
                  );
                  const saved = cursorSchema.parse(protection.open(decoded, binding));
                  if (
                    saved.eventId !== request.eventId ||
                    saved.userId !== principal.userId ||
                    saved.includeDetails !== request.includeDetails ||
                    saved.sourceFingerprint !== sourceFingerprint ||
                    canonicalJson(saved.policy) !== canonicalJson(policy)
                  )
                    fail('INVALID_CURSOR');
                  watermark = unwire(saved.watermark);
                  previous = unwire(saved.previous);
                  if (
                    watermark.eventId !== request.eventId ||
                    previous.eventId !== request.eventId ||
                    previous.version <= 0 ||
                    previous.version >= watermark.version
                  )
                    fail('INVALID_CURSOR');
                } catch {
                  return fail('INVALID_CURSOR');
                }
                if (current.version < watermark.version) fail('INTEGRITY_FAILURE');
                const anchors = await journal
                  .find(
                    {
                      eventId: request.eventId,
                      version: { $in: [previous.version, watermark.version] },
                    },
                    { session },
                  )
                  .limit(3)
                  .toArray();
                if (
                  anchors.length !== 2 ||
                  anchors.filter((row) => row.version === previous.version).length !== 1 ||
                  anchors.filter((row) => row.version === watermark.version).length !== 1
                )
                  fail('INTEGRITY_FAILURE');
                for (const anchor of anchors) {
                  const row = checkedJournal(anchor, request.eventId);
                  if (!equal(row.after, row.version === previous.version ? previous : watermark))
                    fail('INTEGRITY_FAILURE');
                }
              }
              const count = Math.min(request.limit, watermark.version - previous.version);
              const rows = await journal
                .find(
                  {
                    eventId: request.eventId,
                    version: { $gt: previous.version, $lte: previous.version + count },
                  },
                  { session },
                )
                .sort({ version: 1 })
                .limit(count + 1)
                .toArray();
              if (rows.length !== count) fail('INTEGRITY_FAILURE');
              const entries: HistoryEntry[] = [];
              for (const value of rows) {
                const row = checkedJournal(value, request.eventId);
                if (row.version !== previous.version + 1 || !equal(row.before, previous))
                  fail('INTEGRITY_FAILURE');
                entries.push({
                  version: row.version,
                  timestamp: row.ts.toISOString(),
                  reason: row.reason,
                  before: publicState(row.before),
                  after: publicState(row.after),
                  ...(request.includeDetails
                    ? {
                        details: {
                          actor: row.actor,
                          role: row.role,
                          policyId: row.policyId,
                          policyRevision: row.policyRevision,
                          ...(row.reason === 'operator_retry'
                            ? { membershipId: row.membershipId, reasonCode: row.reasonCode }
                            : {}),
                          ...(row.reason === 'lease_renewed'
                            ? {
                                renewalPolicyId: row.renewalPolicyId,
                                renewalPolicyRevision: row.renewalPolicyRevision,
                              }
                            : {}),
                        },
                      }
                    : {}),
                });
                previous = row.after;
              }
              if (previous.version === watermark.version && !equal(previous, watermark))
                fail('INTEGRITY_FAILURE');
              const nextCursor =
                previous.version === watermark.version
                  ? null
                  : Buffer.from(
                      JSON.stringify(
                        protection.seal(
                          {
                            format: 1,
                            eventId: request.eventId,
                            userId: principal.userId,
                            policy,
                            includeDetails: request.includeDetails,
                            sourceFingerprint,
                            watermark: wire(watermark),
                            previous: wire(previous),
                          },
                          binding,
                        ),
                      ),
                    ).toString('base64url');
              return {
                eventId: request.eventId,
                watermarkVersion: watermark.version,
                entries,
                nextCursor,
              };
            },
            {
              readConcern: { level: 'snapshot' },
              readPreference: 'primary',
              writeConcern: { w: 'majority' },
            },
          );
          if (result === undefined) fail('STORAGE_UNAVAILABLE');
          return result;
        } finally {
          await session.endSession();
        }
      });
    },
  };
}
