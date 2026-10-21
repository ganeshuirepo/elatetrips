import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { RunnerRoute } from './outbox-runner';

const id = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value && !value.includes('\0'));
// Node clamps larger timer delays to 1ms; reject them rather than silently changing policy.
const timerMs = z
  .number()
  .int()
  .positive()
  .max(2 ** 31 - 1);
export const managedConsumerPolicySchema = z
  .object({
    policyId: id,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    enabled: z.boolean(),
    heartbeatIntervalMs: timerMs,
    deadlineMs: timerMs,
  })
  .strict();
export type ManagedConsumerPolicy = z.infer<typeof managedConsumerPolicySchema>;
export interface ManagedConsumerOptions {
  route: RunnerRoute;
  policy: ManagedConsumerPolicy;
  /** Trusted abortable scheduler seam. No work is scheduled until handle is called. */
  wait?(milliseconds: number, signal: AbortSignal): Promise<void>;
}
type ManagedConsumerCode =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_REQUEST'
  | 'DISABLED'
  | 'CONTROL_REQUIRED'
  | 'CANCELLED'
  | 'DEADLINE_EXCEEDED'
  | 'LEASE_UNAVAILABLE'
  | 'RENEWAL_FAILED'
  | 'WAIT_FAILED'
  | 'HANDLER_FAILED';
export class ManagedConsumerError extends Error {
  constructor(readonly code: ManagedConsumerCode) {
    super(code);
    this.name = 'ManagedConsumerError';
  }
}

/** Opt-in trusted route wrapper. Cancellation only signals the consumer: completion
 * drains the consumer and any active renewal before the worker may acknowledge.
 * A consumer that ignores cancellation can prevent shutdown indefinitely.
 */
export function createManagedConsumer(options: ManagedConsumerOptions): RunnerRoute {
  const parsed = managedConsumerPolicySchema.safeParse(options.policy);
  if (
    !parsed.success ||
    !id.safeParse(options.route?.kind).success ||
    !id.safeParse(options.route?.schemaVersion).success ||
    typeof options.route?.handle !== 'function' ||
    (options.wait !== undefined && typeof options.wait !== 'function')
  )
    throw new ManagedConsumerError('INVALID_CONFIGURATION');
  const policy = parsed.data;
  const { kind, schemaVersion, handle } = options.route;
  const wait =
    options.wait ??
    (async (milliseconds, signal) => {
      await delay(milliseconds, undefined, { signal });
    });
  return Object.freeze<RunnerRoute>({
    kind,
    schemaVersion,
    async handle(message, signal, control) {
      if (!(signal instanceof AbortSignal)) throw new ManagedConsumerError('INVALID_REQUEST');
      if (!policy.enabled) throw new ManagedConsumerError('DISABLED');
      if (signal.aborted) throw new ManagedConsumerError('CANCELLED');
      if (!control || typeof control.renewLease !== 'function')
        throw new ManagedConsumerError('CONTROL_REQUIRED');
      const consumer = new AbortController();
      const heartbeatTimer = new AbortController();
      const deadlineTimer = new AbortController();
      let failure: ManagedConsumerError | undefined;
      let settled = false;
      function stop(code: ManagedConsumerCode) {
        if (settled) return;
        failure ??= new ManagedConsumerError(code);
        consumer.abort(failure);
        heartbeatTimer.abort();
        deadlineTimer.abort();
      }
      const cancel = () => stop('CANCELLED');
      signal.addEventListener('abort', cancel, { once: true });
      // Keep rejection handlers attached immediately, including while consumer code runs.
      const deadline = (async () => {
        try {
          await wait(policy.deadlineMs, deadlineTimer.signal);
          if (!deadlineTimer.signal.aborted) stop('DEADLINE_EXCEEDED');
        } catch {
          if (!deadlineTimer.signal.aborted) stop('WAIT_FAILED');
        }
      })();
      const heartbeat = (async () => {
        while (!heartbeatTimer.signal.aborted) {
          try {
            await wait(policy.heartbeatIntervalMs, heartbeatTimer.signal);
          } catch {
            if (!heartbeatTimer.signal.aborted) stop('WAIT_FAILED');
            return;
          }
          if (heartbeatTimer.signal.aborted) return;
          try {
            const result = await control.renewLease();
            if (result.status !== 'renewed' && result.status !== 'unchanged') {
              stop('LEASE_UNAVAILABLE');
              return;
            }
          } catch {
            stop('RENEWAL_FAILED');
            return;
          }
        }
      })();
      try {
        // A synchronous scheduler failure may already have cancelled this invocation.
        if (!consumer.signal.aborted) {
          try {
            await handle(message, consumer.signal, control);
          } catch {
            stop('HANDLER_FAILED');
          }
        }
      } finally {
        // Do not mark settled until an in-flight renewal has drained: failure while
        // draining must still prevent success, including a custom worker control.
        heartbeatTimer.abort();
        await heartbeat;
        // Deadline remains live through renewal drain, not only consumer execution.
        deadlineTimer.abort();
        await deadline;
        settled = true;
        signal.removeEventListener('abort', cancel);
      }
      if (failure) throw failure;
    },
  });
}
