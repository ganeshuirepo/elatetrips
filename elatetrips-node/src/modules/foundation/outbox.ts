import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { z } from 'zod';
import { createJsonProtection, type StorageKeys } from './encrypted-json';
import {
  authenticateFoundationEvent,
  type FoundationEvent,
  type StoredFoundationEvent,
} from './foundation-event';
export type { FoundationEvent } from './foundation-event';
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
const timestampSchema = z.string().datetime({ offset: true });
const integer = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER - 1);
export const deliveryPolicySchema = z
  .object({
    policyId: id,
    revision: integer.positive(),
    leaseDurationMs: integer.positive(),
    maxAttempts: integer.positive(),
    retryDelaysMs: z.array(integer),
  })
  .strict()
  .refine((value) => value.retryDelaysMs.length === value.maxAttempts - 1);
export type DeliveryPolicy = z.infer<typeof deliveryPolicySchema>;
export const leaseRenewalPolicySchema = z
  .object({
    policyId: id,
    revision: integer.positive(),
    maxExtensions: integer,
    maxLifetimeMs: integer.positive(),
  })
  .strict();
export type LeaseRenewalPolicy = z.infer<typeof leaseRenewalPolicySchema>;
interface DeliveryAudit {
  _id: string;
  eventId: string;
  version: number;
  ts: Date;
  policyId: string;
  policyRevision: number;
  actor: string;
  role: 'worker';
  reason:
    | 'claimed'
    | 'reclaimed'
    | 'delivered'
    | 'retry_scheduled'
    | 'attempts_exhausted'
    | 'invalid_event'
    | 'lease_renewed';
  renewalPolicyId?: string;
  renewalPolicyRevision?: number;
  before: DeliverySnapshot;
  after: DeliverySnapshot;
}
type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_CONFIGURATION'
  | 'TRANSACTIONS_REQUIRED'
  | 'STORAGE_UNAVAILABLE'
  | 'INTEGRITY_FAILURE';
export class OutboxError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'OutboxError';
  }
}
function fail(code: ErrorCode): never {
  throw new OutboxError(code);
}
export interface OutboxOptions {
  client: mongo.MongoClient;
  database: string;
  namespace: string;
  keys: StorageKeys;
  clock(): string;
  policy: DeliveryPolicy;
  /** Absent means renewal is disabled. Limits apply to one claimed delivery attempt. */
  renewal?: LeaseRenewalPolicy;
}
export interface OutboxMessage {
  /** Stable deduplication key for the trusted consumer/provider adapter. */
  eventId: string;
  occurredAt: string;
  receivedAt: string;
  event: FoundationEvent;
}
export type LeaseRenewalResult =
  | { status: 'renewed'; leaseUntil: string }
  | { status: 'disabled' | 'closed' | 'unchanged' | 'limit_reached' | 'lease_lost' };
export interface DeliveryControl {
  /** Process-local capability; never serialize or expose through an API. */
  renewLease(): Promise<LeaseRenewalResult>;
}
export type DeliveryHandler = (message: OutboxMessage, control?: DeliveryControl) => Promise<void>;
export type DeliveryResult =
  | { status: 'idle' }
  | {
      status: 'delivered' | 'retry_scheduled' | 'dead' | 'lease_lost';
      eventId: string;
    };
type Claim =
  | { status: 'leased'; row: OutboxDelivery; receivedAt: string }
  | { status: 'idle' }
  | { status: 'dead'; eventId: string };

/** Explicit one-entry worker: no scheduler, external adapter or process-wide connection.
 * A handler may receive an event again after a crash/lease expiry. Deduplicate by eventId.
 * Never run a non-idempotent notification/payment operation directly as this handler.
 */
export async function openOutboxWorker(options: OutboxOptions) {
  const parsed = deliveryPolicySchema.safeParse(options.policy);
  if (
    !parsed.success ||
    !/^[a-z][a-z0-9_]*$/.test(options.namespace) ||
    !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(options.database)
  )
    fail('INVALID_CONFIGURATION');
  const policy = parsed.data; // Zod detaches caller-owned policy arrays.
  const renewal =
    options.renewal === undefined ? undefined : leaseRenewalPolicySchema.safeParse(options.renewal);
  if (renewal && (!renewal.success || renewal.data.maxLifetimeMs < policy.leaseDurationMs))
    fail('INVALID_CONFIGURATION');
  const renewalPolicy = renewal?.success ? renewal.data : undefined;
  const { client, database, namespace, clock } = options;
  let protection: ReturnType<typeof createJsonProtection>;
  try {
    protection = createJsonProtection(options.keys);
  } catch {
    return fail('INVALID_CONFIGURATION');
  }
  const db = client.db(database);
  const queue = db.collection<OutboxDelivery>(`${namespace}_outbox`);
  const events = db.collection<StoredFoundationEvent>(`${namespace}_audit`);
  const journal = db.collection<DeliveryAudit>(`${namespace}_delivery_audit`);
  async function guarded<R>(operation: () => Promise<R>): Promise<R> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof OutboxError) throw error;
      return fail('STORAGE_UNAVAILABLE');
    }
  }
  await guarded(async () => {
    const hello = await db.admin().command({ hello: 1 });
    if ((!hello.setName && hello.msg !== 'isdbgrid') || hello.logicalSessionTimeoutMinutes == null)
      fail('TRANSACTIONS_REQUIRED');
    await queue.createIndex({ state: 1, availableAt: 1, _id: 1 });
    await queue.createIndex({ state: 1, leaseUntil: 1, _id: 1 });
    await journal.createIndex({ eventId: 1, version: 1 }, { unique: true });
  });

  function now(): Date {
    try {
      return new Date(timestampSchema.parse(clock()));
    } catch {
      return fail('INVALID_REQUEST');
    }
  }
  function later(time: Date, delayMs: number): Date {
    const result = new Date(time.getTime() + delayMs);
    if (!Number.isFinite(result.getTime())) fail('INVALID_CONFIGURATION');
    return result;
  }
  function checked(row: unknown): OutboxDelivery {
    const result = deliverySchema.safeParse(row);
    if (!result.success) fail('INTEGRITY_FAILURE');
    return result.data;
  }
  async function transaction<R>(
    operation: (session: mongo.ClientSession) => Promise<R>,
  ): Promise<R> {
    return guarded(async () => {
      const session = client.startSession();
      try {
        const result = await session.withTransaction(() => operation(session), {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
        });
        if (result === undefined) fail('STORAGE_UNAVAILABLE');
        return result;
      } finally {
        await session.endSession();
      }
    });
  }
  async function transition(
    before: OutboxDelivery,
    after: OutboxDelivery,
    workerId: string,
    reason: DeliveryAudit['reason'],
    ts: Date,
    session: mongo.ClientSession,
  ) {
    const next = checked(after);
    const update = await queue.replaceOne(
      {
        _id: before._id,
        version: before.version,
        leaseToken: before.leaseToken,
        state: before.state,
      },
      next,
      { session },
    );
    if (update.matchedCount !== 1) fail('INTEGRITY_FAILURE');
    await journal.insertOne(
      {
        _id: randomUUID(),
        eventId: before.eventId,
        version: next.version,
        policyId: policy.policyId,
        policyRevision: policy.revision,
        ts,
        actor: workerId,
        role: 'worker',
        reason,
        before: deliverySnapshot(before),
        after: deliverySnapshot(next),
        ...(reason === 'lease_renewed' && renewalPolicy
          ? {
              renewalPolicyId: renewalPolicy.policyId,
              renewalPolicyRevision: renewalPolicy.revision,
            }
          : {}),
      },
      { session },
    );
  }
  async function claim(workerId: string): Promise<Claim> {
    return transaction(async (session) => {
      const ts = now();
      const found = await queue.findOne(
        {
          $or: [
            { state: 'pending', availableAt: { $lte: ts } },
            { state: 'leased', leaseUntil: { $lte: ts } },
          ],
        },
        { session, sort: { availableAt: 1, _id: 1 } },
      );
      if (!found) return { status: 'idle' };
      const before = checked(found);
      if (before.attempts >= policy.maxAttempts) {
        const after: OutboxDelivery = {
          ...before,
          version: before.version + 1,
          state: 'dead',
          leaseUntil: null,
          leaseToken: null,
          workerId: null,
          lastError:
            before.state === 'leased' ? 'LEASE_EXPIRED' : (before.lastError ?? 'DELIVERY_FAILED'),
        };
        await transition(before, after, workerId, 'attempts_exhausted', ts, session);
        return { status: 'dead', eventId: before.eventId };
      }
      const after: OutboxDelivery = {
        ...before,
        state: 'leased',
        version: before.version + 1,
        attempts: before.attempts + 1,
        totalAttempts: before.totalAttempts + 1,
        leaseUntil: later(ts, policy.leaseDurationMs),
        leaseToken: randomUUID(),
        workerId,
      };
      await transition(
        before,
        after,
        workerId,
        before.state === 'leased' ? 'reclaimed' : 'claimed',
        ts,
        session,
      );
      return { status: 'leased', row: after, receivedAt: ts.toISOString() };
    });
  }
  async function finish(
    lease: OutboxDelivery,
    failure: 'DELIVERY_FAILED' | 'INVALID_EVENT' | null,
  ): Promise<DeliveryResult> {
    return transaction(async (session) => {
      const ts = now();
      const found = await queue.findOne({ _id: lease._id }, { session });
      if (!found) fail('INTEGRITY_FAILURE');
      const before = checked(found);
      if (
        before.state !== 'leased' ||
        before.version !== lease.version ||
        before.leaseToken !== lease.leaseToken ||
        before.workerId !== lease.workerId ||
        before.leaseUntil === null ||
        ts.getTime() >= before.leaseUntil.getTime()
      )
        return { status: 'lease_lost', eventId: lease.eventId };
      if (!before.workerId) fail('INTEGRITY_FAILURE');
      const exhausted = before.attempts >= policy.maxAttempts;
      const state =
        failure === null
          ? 'delivered'
          : failure === 'INVALID_EVENT' || exhausted
            ? 'dead'
            : 'pending';
      const delay = policy.retryDelaysMs[before.attempts - 1];
      if (state === 'pending' && delay === undefined) fail('INVALID_CONFIGURATION');
      const after: OutboxDelivery = {
        ...before,
        state,
        version: before.version + 1,
        leaseUntil: null,
        leaseToken: null,
        workerId: null,
        lastError: failure,
        deliveredAt: state === 'delivered' ? ts : null,
        availableAt: state === 'pending' ? later(ts, delay) : before.availableAt,
      };
      const reason =
        state === 'delivered'
          ? 'delivered'
          : state === 'pending'
            ? 'retry_scheduled'
            : failure === 'INVALID_EVENT'
              ? 'invalid_event'
              : 'attempts_exhausted';
      await transition(before, after, before.workerId, reason, ts, session);
      return { status: state === 'pending' ? 'retry_scheduled' : state, eventId: before.eventId };
    });
  }

  function controls(initial: OutboxDelivery, receivedAt: string) {
    let lease = initial;
    let active = true;
    let lost = false;
    let extensions = 0;
    let pending = Promise.resolve();
    let failure: OutboxError | undefined;
    const started = new Date(receivedAt);
    const control: DeliveryControl = Object.freeze({
      renewLease(): Promise<LeaseRenewalResult> {
        if (!active) return Promise.resolve({ status: 'closed' });
        if (!renewalPolicy) return Promise.resolve({ status: 'disabled' });
        const configured = renewalPolicy;
        // Serialize renewals and drain accepted calls before acknowledgment. This also
        // observes failures when a consumer accidentally forgets to await its call.
        const request = pending.then(async (): Promise<LeaseRenewalResult> => {
          if (failure) throw failure;
          if (lost) return { status: 'lease_lost' };
          const result = await transaction(async (session) => {
            const ts = now();
            if (ts.getTime() < started.getTime()) fail('INVALID_REQUEST');
            const found = await queue.findOne({ _id: lease._id }, { session });
            if (!found) fail('INTEGRITY_FAILURE');
            const before = checked(found);
            if (
              before.state !== 'leased' ||
              before.version !== lease.version ||
              before.leaseToken !== lease.leaseToken ||
              before.workerId !== lease.workerId ||
              before.leaseUntil === null ||
              ts.getTime() >= before.leaseUntil.getTime()
            )
              return { status: 'lease_lost' as const };
            const deadline = later(started, configured.maxLifetimeMs);
            if (
              extensions >= configured.maxExtensions ||
              before.leaseUntil.getTime() >= deadline.getTime()
            )
              return { status: 'limit_reached' as const };
            const until = new Date(
              Math.min(later(ts, policy.leaseDurationMs).getTime(), deadline.getTime()),
            );
            if (until.getTime() <= before.leaseUntil.getTime())
              return { status: 'unchanged' as const };
            if (!before.workerId) fail('INTEGRITY_FAILURE');
            const after: OutboxDelivery = {
              ...before,
              version: before.version + 1,
              leaseUntil: until,
            };
            await transition(before, after, before.workerId, 'lease_renewed', ts, session);
            return { status: 'renewed' as const, row: after };
          });
          if (result.status === 'renewed') {
            lease = result.row;
            extensions += 1;
            return {
              status: 'renewed',
              leaseUntil: result.row.leaseUntil?.toISOString() ?? fail('INTEGRITY_FAILURE'),
            };
          }
          if (result.status === 'lease_lost') lost = true;
          return result;
        });
        pending = request.then(
          () => {},
          (error: unknown) => {
            failure = error instanceof OutboxError ? error : new OutboxError('STORAGE_UNAVAILABLE');
          },
        );
        return request;
      },
    });
    return {
      control,
      close: () => {
        active = false;
      },
      async complete(handlerFailed: boolean) {
        await pending;
        if (failure) throw failure;
        if (lost) return { status: 'lease_lost' as const, eventId: lease.eventId };
        return finish(lease, handlerFailed ? 'DELIVERY_FAILED' : null);
      },
    };
  }

  return {
    async runOnce(workerId: string, handler: DeliveryHandler): Promise<DeliveryResult> {
      if (!id.safeParse(workerId).success || typeof handler !== 'function') fail('INVALID_REQUEST');
      const claimed = await claim(workerId);
      if (claimed.status !== 'leased') return claimed;
      const lease = claimed.row;
      // Storage faults remain retryable lease recovery; invalid event bodies are quarantined.
      const stored = await guarded(() =>
        events.findOne(
          { _id: lease.eventId },
          { readPreference: 'primary', readConcern: { level: 'majority' } },
        ),
      );
      let event: FoundationEvent;
      try {
        event = authenticateFoundationEvent(stored, protection, {
          database,
          namespace,
          eventId: lease.eventId,
        });
      } catch {
        return finish(lease, 'INVALID_EVENT');
      }
      const delivery = controls(lease, claimed.receivedAt);
      let handlerFailed = false;
      try {
        await handler(
          {
            eventId: lease.eventId,
            occurredAt: event.ts,
            receivedAt: claimed.receivedAt,
            event,
          },
          delivery.control,
        );
      } catch {
        handlerFailed = true;
      } finally {
        delivery.close();
      }
      return delivery.complete(handlerFailed);
    },
  };
}
