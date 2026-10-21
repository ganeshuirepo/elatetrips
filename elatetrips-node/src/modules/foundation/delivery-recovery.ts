import { createHash, randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { z } from 'zod';
import {
  canonicalJson,
  createJsonProtection,
  type EncryptedJson,
  type StorageKeys,
} from './encrypted-json';
import { authenticateFoundationEvent, type StoredFoundationEvent } from './foundation-event';
import { authorizeResource, type MembershipDirectory, type VerifiedPrincipal } from './identity';
import {
  deliverySchema,
  deliverySnapshot,
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
const time = z.string().datetime({ offset: true });
const reason = z.string().regex(/^[a-z][a-z0-9_]*$/);
export const recoveryPolicySchema = z
  .object({
    policyId: id,
    revision: integer.positive(),
    retryEnabled: z.boolean(),
    maxRecoveriesPerEvent: integer,
    retryDelayMs: integer,
    reasonCodes: z.array(reason),
  })
  .strict()
  .refine((policy) => new Set(policy.reasonCodes).size === policy.reasonCodes.length);
export type RecoveryPolicy = z.infer<typeof recoveryPolicySchema>;
const retrySchema = z
  .object({ commandId: id, eventId: id, expectedVersion: integer, reasonCode: reason })
  .strict();
const resultSchema = z
  .object({
    eventId: id,
    state: z.literal('pending'),
    version: integer,
    recoveryCount: integer,
    availableAt: time,
  })
  .strict();
export type RecoveryRequest = z.infer<typeof retrySchema>;
export type RecoveryResult = z.infer<typeof resultSchema>;
const receiptSchema = z
  .object({
    _id: id,
    commandId: id,
    eventId: id,
    policyId: id,
    policyRevision: integer.positive(),
    body: z.unknown(),
  })
  .strict();
const receiptBodySchema = z
  .object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/), result: resultSchema })
  .strict();
interface Receipt extends Omit<z.infer<typeof receiptSchema>, 'body'> {
  body: EncryptedJson;
}
interface RecoveryAudit {
  _id: string;
  eventId: string;
  version: number;
  ts: Date;
  policyId: string;
  policyRevision: number;
  actor: string;
  role: string;
  membershipId: string;
  reason: 'operator_retry';
  reasonCode: string;
  before: DeliverySnapshot;
  after: DeliverySnapshot;
}
type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_CONFIGURATION'
  | 'TRANSACTIONS_REQUIRED'
  | 'STORAGE_UNAVAILABLE'
  | 'INTEGRITY_FAILURE'
  | 'EVENT_INVALID'
  | 'NOT_FOUND'
  | 'AUTH_SCOPE_DENIED'
  | 'POLICY_INVALID'
  | 'IDENTITY_UNAVAILABLE'
  | 'RECOVERY_DISABLED'
  | 'RECOVERY_LIMIT'
  | 'REVISION_CONFLICT'
  | 'DELIVERY_NOT_DEAD'
  | 'IDEMPOTENCY_CONFLICT';
export class DeliveryRecoveryError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'DeliveryRecoveryError';
  }
}
function fail(code: ErrorCode): never {
  throw new DeliveryRecoveryError(code);
}
export interface RecoveryOptions {
  client: mongo.MongoClient;
  database: string;
  namespace: string;
  keys: StorageKeys;
  clock(): string;
  policy: RecoveryPolicy;
  memberships: MembershipDirectory;
  loadPolicy(): Promise<unknown>;
}
export interface DeliveryInspection {
  eventId: string;
  kind: string;
  aggregateId: string;
  sourceRevision: number;
  occurredAt: string;
  delivery: {
    state: OutboxDelivery['state'];
    version: number;
    attempts: number;
    totalAttempts: number;
    recoveryCount: number;
    availableAt: string;
    leaseUntil: string | null;
    deliveredAt: string | null;
    lastError: OutboxDelivery['lastError'];
  };
}

/** Explicit scoped recovery port. No source-event edits, direct delivery, HTTP route or scheduler. */
export async function openDeliveryRecovery(options: RecoveryOptions) {
  const parsed = recoveryPolicySchema.safeParse(options.policy);
  if (
    !parsed.success ||
    !/^[a-z][a-z0-9_]*$/.test(options.namespace) ||
    !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(options.database)
  )
    fail('INVALID_CONFIGURATION');
  const policy = parsed.data;
  const { client, database, namespace, clock, memberships, loadPolicy } = options;
  let protection: ReturnType<typeof createJsonProtection>;
  try {
    protection = createJsonProtection(options.keys);
  } catch {
    return fail('INVALID_CONFIGURATION');
  }
  const db = client.db(database);
  const queue = db.collection<OutboxDelivery>(`${namespace}_outbox`);
  const events = db.collection<StoredFoundationEvent>(`${namespace}_audit`);
  const journal = db.collection<RecoveryAudit>(`${namespace}_delivery_audit`);
  const receipts = db.collection<Receipt>(`${namespace}_recovery_receipts`);
  async function guarded<R>(operation: () => Promise<R>): Promise<R> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DeliveryRecoveryError) throw error;
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
    await journal.createIndex({ eventId: 1, version: 1 }, { unique: true });
    await receipts.createIndex({ policyId: 1, commandId: 1 }, { unique: true });
  });
  function now(): Date {
    try {
      return new Date(time.parse(clock()));
    } catch {
      return fail('INVALID_REQUEST');
    }
  }
  function checked(value: unknown): OutboxDelivery {
    const result = deliverySchema.safeParse(value);
    if (!result.success) fail('INTEGRITY_FAILURE');
    return result.data;
  }
  function binding(metadata: unknown): string {
    return canonicalJson({ database, namespace, type: 'delivery-recovery-receipt', metadata });
  }
  async function transaction<R>(
    operation: (session: mongo.ClientSession) => Promise<R>,
    retryDuplicate = false,
  ): Promise<R> {
    return guarded(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const session = client.startSession();
        try {
          const result = await session.withTransaction(() => operation(session), {
            readConcern: { level: 'snapshot' },
            readPreference: 'primary',
            writeConcern: { w: 'majority' },
          });
          if (result === undefined) fail('STORAGE_UNAVAILABLE');
          return result;
        } catch (error) {
          if (
            retryDuplicate &&
            attempt === 0 &&
            error instanceof mongo.MongoServerError &&
            error.code === 11000
          )
            continue;
          throw error;
        } finally {
          await session.endSession();
        }
      }
      return fail('STORAGE_UNAVAILABLE');
    });
  }
  async function source(eventId: string, session: mongo.ClientSession) {
    const stored = await events.findOne({ _id: eventId }, { session });
    if (!stored) {
      if (await queue.findOne({ _id: eventId }, { session })) fail('EVENT_INVALID');
      return null;
    }
    try {
      return authenticateFoundationEvent(stored, protection, { database, namespace, eventId });
    } catch {
      return fail('EVENT_INVALID');
    }
  }
  async function authorize(
    principal: VerifiedPrincipal,
    scope: unknown,
    action: 'delivery.read' | 'delivery.retry',
    ts: Date,
  ) {
    let permission: unknown;
    try {
      permission = await loadPolicy();
    } catch {
      return fail('IDENTITY_UNAVAILABLE');
    }
    const decision = await authorizeResource(
      { principal, resource: scope, action, policy: permission, now: ts.toISOString() },
      memberships,
    );
    if (!decision.authorized) return fail(decision.code);
    return decision.actor;
  }

  return {
    async inspect(
      principal: VerifiedPrincipal,
      eventId: string,
    ): Promise<DeliveryInspection | null> {
      if (!id.safeParse(eventId).success) fail('INVALID_REQUEST');
      return transaction(async (session) => {
        const ts = now();
        const event = await source(eventId, session);
        if (!event) return null;
        await authorize(principal, event.scope, 'delivery.read', ts);
        const found = await queue.findOne({ _id: eventId }, { session });
        if (!found) return null;
        const row = checked(found);
        return {
          eventId,
          kind: event.kind,
          aggregateId: event.aggregateId,
          sourceRevision: event.revision,
          occurredAt: event.ts,
          delivery: {
            state: row.state,
            version: row.version,
            attempts: row.attempts,
            totalAttempts: row.totalAttempts,
            recoveryCount: row.recoveryCount,
            availableAt: row.availableAt.toISOString(),
            leaseUntil: row.leaseUntil?.toISOString() ?? null,
            deliveredAt: row.deliveredAt?.toISOString() ?? null,
            lastError: row.lastError,
          },
        };
      });
    },
    async retry(principal: VerifiedPrincipal, input: RecoveryRequest): Promise<RecoveryResult> {
      const parsed = retrySchema.safeParse(input);
      if (!parsed.success || !policy.reasonCodes.includes(parsed.data.reasonCode))
        fail('INVALID_REQUEST');
      const request = parsed.data;
      const receiptId = createHash('sha256')
        .update(canonicalJson([policy.policyId, request.commandId]))
        .digest('hex');
      const metadata = {
        _id: receiptId,
        commandId: request.commandId,
        eventId: request.eventId,
        policyId: policy.policyId,
        policyRevision: policy.revision,
      };
      return transaction(async (session) => {
        const ts = now();
        const event = await source(request.eventId, session);
        if (!event) fail('NOT_FOUND');
        const actor = await authorize(principal, event.scope, 'delivery.retry', ts);
        const found = await queue.findOne({ _id: request.eventId }, { session });
        if (!found) fail('NOT_FOUND');
        const before = checked(found);
        const fingerprint = protection.fingerprint({ request, actor, policy, source: event });
        const receipt = await receipts.findOne({ _id: receiptId }, { session });
        if (receipt) {
          try {
            const parsedReceipt = receiptSchema.parse(receipt);
            const { body, ...savedMetadata } = parsedReceipt;
            const content = receiptBodySchema.parse(protection.open(body, binding(savedMetadata)));
            if (content.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT');
            if (
              canonicalJson(savedMetadata) !== canonicalJson(metadata) ||
              content.result.eventId !== request.eventId ||
              content.result.version !== request.expectedVersion + 1 ||
              before.version < content.result.version ||
              before.recoveryCount < content.result.recoveryCount
            )
              fail('INTEGRITY_FAILURE');
            return content.result;
          } catch (error) {
            if (error instanceof DeliveryRecoveryError) throw error;
            return fail('INTEGRITY_FAILURE');
          }
        }
        if (!policy.retryEnabled) fail('RECOVERY_DISABLED');
        if (before.version !== request.expectedVersion) fail('REVISION_CONFLICT');
        if (before.state !== 'dead') fail('DELIVERY_NOT_DEAD');
        if (before.recoveryCount >= policy.maxRecoveriesPerEvent) fail('RECOVERY_LIMIT');
        const availableAt = new Date(ts.getTime() + policy.retryDelayMs);
        if (!Number.isFinite(availableAt.getTime())) fail('INVALID_CONFIGURATION');
        const after = checked({
          ...before,
          state: 'pending',
          version: before.version + 1,
          attempts: 0,
          recoveryCount: before.recoveryCount + 1,
          availableAt,
          leaseUntil: null,
          leaseToken: null,
          workerId: null,
          deliveredAt: null,
        });
        const update = await queue.replaceOne(
          { _id: request.eventId, version: request.expectedVersion, state: 'dead' },
          after,
          { session },
        );
        if (update.matchedCount !== 1) fail('REVISION_CONFLICT');
        await journal.insertOne(
          {
            _id: randomUUID(),
            eventId: request.eventId,
            version: after.version,
            ts,
            policyId: policy.policyId,
            policyRevision: policy.revision,
            actor: actor.userId,
            role: actor.role,
            membershipId: actor.membershipId,
            reason: 'operator_retry',
            reasonCode: request.reasonCode,
            before: deliverySnapshot(before),
            after: deliverySnapshot(after),
          },
          { session },
        );
        const result: RecoveryResult = {
          eventId: request.eventId,
          state: 'pending',
          version: after.version,
          recoveryCount: after.recoveryCount,
          availableAt: availableAt.toISOString(),
        };
        await receipts.insertOne(
          { ...metadata, body: protection.seal({ fingerprint, result }, binding(metadata)) },
          { session },
        );
        return result;
      }, true);
    },
  };
}
