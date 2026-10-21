import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import {
  OutboxError,
  type DeliveryHandler,
  type DeliveryResult,
  type OutboxMessage,
  type DeliveryControl,
} from './outbox';

const id = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value && !value.includes('\0'));
// Node timers clamp larger values to 1ms. Reject them instead of creating a hot loop.
const timerMs = z
  .number()
  .int()
  .nonnegative()
  .max(2 ** 31 - 1);
export const runnerPolicySchema = z
  .object({
    policyId: id,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    enabled: z.boolean(),
    idleDelayMs: timerMs.positive(),
    workDelayMs: timerMs,
    storageRetryDelaysMs: z.array(timerMs.positive()),
  })
  .strict();
export type RunnerPolicy = z.infer<typeof runnerPolicySchema>;
export interface RunnerRoute {
  kind: string;
  schemaVersion: string;
  /** Trusted internal consumer; deduplicate durable effects using message.eventId. */
  handle(message: OutboxMessage, signal: AbortSignal, control?: DeliveryControl): Promise<void>;
}
export interface RunnerOptions {
  worker: { runOnce(workerId: string, handler: DeliveryHandler): Promise<DeliveryResult> };
  workerId: string;
  policy: RunnerPolicy;
  routes: readonly RunnerRoute[];
  /** Host-owned scheduler seam. Production defaults to an abortable Node timer. */
  wait?(milliseconds: number, signal: AbortSignal): Promise<void>;
}
type RunnerCode =
  'INVALID_CONFIGURATION' | 'INVALID_REQUEST' | 'ALREADY_STARTED' | 'WORKER_FAILED' | 'WAIT_FAILED';
export class OutboxRunnerError extends Error {
  constructor(readonly code: RunnerCode) {
    super(code);
    this.name = 'OutboxRunnerError';
  }
}
const resultSchema = z.union([
  z.object({ status: z.literal('idle') }).strict(),
  z
    .object({ status: z.enum(['delivered', 'retry_scheduled', 'dead', 'lease_lost']), eventId: id })
    .strict(),
]);
export interface RunnerCounts {
  idle: number;
  delivered: number;
  retry_scheduled: number;
  dead: number;
  lease_lost: number;
  storageErrors: number;
  unroutable: number;
}
export type RunnerState = 'ready' | 'running' | 'stopped' | 'disabled' | 'faulted';
export interface RunnerReport {
  policyId: string;
  policyRevision: number;
  workerId: string;
  state: RunnerState;
  counts: RunnerCounts;
}

/** No work begins until run(signal) is explicitly awaited by a host. One runner is
 * single-use and sequential; shutdown waits for the active claim/consumer/ack.
 * Cancellation is cooperative and cannot undo an external side effect.
 */
export function createOutboxRunner(options: RunnerOptions) {
  const parsed = runnerPolicySchema.safeParse(options.policy);
  if (
    !parsed.success ||
    !id.safeParse(options.workerId).success ||
    typeof options.worker?.runOnce !== 'function' ||
    !Array.isArray(options.routes) ||
    (options.wait !== undefined && typeof options.wait !== 'function')
  )
    throw new OutboxRunnerError('INVALID_CONFIGURATION');
  const policy = parsed.data;
  const workerId = options.workerId;
  const worker = options.worker;
  const wait =
    options.wait ??
    (async (ms, signal) => {
      await delay(ms, undefined, { signal });
    });
  const routes = new Map<string, RunnerRoute['handle']>();
  const routeKey = (kind: string, schemaVersion: string) => JSON.stringify([kind, schemaVersion]);
  for (const route of options.routes) {
    if (
      !route ||
      !id.safeParse(route.kind).success ||
      !id.safeParse(route.schemaVersion).success ||
      typeof route.handle !== 'function'
    )
      throw new OutboxRunnerError('INVALID_CONFIGURATION');
    const key = routeKey(route.kind, route.schemaVersion);
    if (routes.has(key)) throw new OutboxRunnerError('INVALID_CONFIGURATION');
    routes.set(key, route.handle);
  }
  let state: RunnerState = 'ready';
  const counts: RunnerCounts = {
    idle: 0,
    delivered: 0,
    retry_scheduled: 0,
    dead: 0,
    lease_lost: 0,
    storageErrors: 0,
    unroutable: 0,
  };
  function snapshot(): RunnerReport {
    return {
      policyId: policy.policyId,
      policyRevision: policy.revision,
      workerId,
      state,
      counts: { ...counts },
    };
  }
  async function pause(ms: number, signal: AbortSignal) {
    if (signal.aborted) return;
    try {
      await wait(ms, signal);
    } catch {
      if (!signal.aborted) throw new OutboxRunnerError('WAIT_FAILED');
    }
  }
  return {
    snapshot,
    async run(signal: AbortSignal): Promise<RunnerReport> {
      if (!(signal instanceof AbortSignal)) throw new OutboxRunnerError('INVALID_REQUEST');
      if (state !== 'ready') throw new OutboxRunnerError('ALREADY_STARTED');
      if (!policy.enabled) {
        state = 'disabled';
        return snapshot();
      }
      state = 'running';
      let consecutiveStorageErrors = 0;
      try {
        while (!signal.aborted) {
          let result: DeliveryResult;
          try {
            result = resultSchema.parse(
              await worker.runOnce(workerId, async (message, control) => {
                // Stop during a claim must not invoke a new consumer or acknowledge it as delivered.
                if (signal.aborted) throw new Error('Consumer cancelled');
                const handle = routes.get(
                  routeKey(message.event.kind, message.event.schemaVersion),
                );
                if (!handle) {
                  counts.unroutable += 1;
                  throw new Error('No configured consumer');
                }
                await handle(message, signal, control);
              }),
            );
          } catch (error) {
            if (!(error instanceof OutboxError) || error.code !== 'STORAGE_UNAVAILABLE')
              throw new OutboxRunnerError('WORKER_FAILED');
            counts.storageErrors += 1;
            if (signal.aborted) break;
            const retryDelay = policy.storageRetryDelaysMs[consecutiveStorageErrors++];
            if (retryDelay === undefined) throw new OutboxRunnerError('WORKER_FAILED');
            await pause(retryDelay, signal);
            continue;
          }
          consecutiveStorageErrors = 0;
          counts[result.status] += 1;
          await pause(result.status === 'idle' ? policy.idleDelayMs : policy.workDelayMs, signal);
        }
        state = 'stopped';
        return snapshot();
      } catch (error) {
        state = 'faulted';
        if (error instanceof OutboxRunnerError) throw error;
        throw new OutboxRunnerError('WORKER_FAILED');
      }
    },
  };
}
