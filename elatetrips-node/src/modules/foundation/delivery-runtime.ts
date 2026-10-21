import { createJsonProtection, type StorageKeys } from './encrypted-json';
import {
  createManagedConsumer,
  managedConsumerPolicySchema,
  type ManagedConsumerPolicy,
} from './managed-consumer';
import {
  deliveryPolicySchema,
  leaseRenewalPolicySchema,
  openOutboxWorker,
  OutboxError,
  type OutboxOptions,
} from './outbox';
import {
  createOutboxRunner,
  runnerPolicySchema,
  type RunnerOptions,
  type RunnerPolicy,
  type RunnerRoute,
} from './outbox-runner';

export interface DeliveryRuntimeOptions extends OutboxOptions {
  workerId: string;
  runnerPolicy: RunnerPolicy;
  managedPolicy: ManagedConsumerPolicy;
  routes: readonly RunnerRoute[];
  /** Trusted abortable host scheduler ports, separate for polling and active consumers. */
  runnerWait?: RunnerOptions['wait'];
  consumerWait?: RunnerOptions['wait'];
}
export class DeliveryRuntimeError extends Error {
  constructor(readonly code: 'INVALID_CONFIGURATION') {
    super(code);
    this.name = 'DeliveryRuntimeError';
  }
}

/** Explicit assembly only. No Mongo calls, indexes, timers or consumer calls occur
 * here. The caller owns the client, clock and configured consumer capabilities.
 */
export function createDeliveryRuntime(options: DeliveryRuntimeOptions) {
  try {
    const policy = deliveryPolicySchema.parse(options.policy);
    const renewal =
      options.renewal === undefined ? undefined : leaseRenewalPolicySchema.parse(options.renewal);
    const runnerPolicy = runnerPolicySchema.parse(options.runnerPolicy);
    const managedPolicy = managedConsumerPolicySchema.parse(options.managedPolicy);
    if (
      !/^[a-z][a-z0-9_]*$/.test(options.namespace) ||
      !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(options.database) ||
      typeof options.clock !== 'function' ||
      typeof options.client?.db !== 'function' ||
      typeof options.client?.startSession !== 'function' ||
      !Array.isArray(options.routes) ||
      (options.runnerWait !== undefined && typeof options.runnerWait !== 'function') ||
      (options.consumerWait !== undefined && typeof options.consumerWait !== 'function') ||
      (renewal && renewal.maxLifetimeMs < policy.leaseDurationMs)
    )
      throw new DeliveryRuntimeError('INVALID_CONFIGURATION');
    if (runnerPolicy.enabled) {
      const minimumLifetime = managedPolicy.deadlineMs + policy.leaseDurationMs;
      // One spare extension avoids a heartbeat/deadline scheduling tie at the cap.
      const minimumExtensions =
        Math.ceil(managedPolicy.deadlineMs / managedPolicy.heartbeatIntervalMs) + 1;
      if (
        !managedPolicy.enabled ||
        !renewal ||
        options.routes.length === 0 ||
        managedPolicy.heartbeatIntervalMs >= policy.leaseDurationMs ||
        !Number.isSafeInteger(minimumLifetime) ||
        renewal.maxLifetimeMs < minimumLifetime ||
        renewal.maxExtensions < minimumExtensions
      )
        throw new DeliveryRuntimeError('INVALID_CONFIGURATION');
    }
    // Validate and detach secrets now, rather than at lazy initialization time.
    // The copied buffers/map remain private and are copied again by the worker.
    if (
      !Buffer.isBuffer(options.keys.fingerprintKey) ||
      [...options.keys.encryptionKeys.values()].some((key) => !Buffer.isBuffer(key))
    )
      throw new DeliveryRuntimeError('INVALID_CONFIGURATION');
    const keys: StorageKeys = {
      activeKeyId: options.keys.activeKeyId,
      encryptionKeys: new Map(
        [...options.keys.encryptionKeys].map(([keyId, key]) => [keyId, Buffer.from(key)]),
      ),
      fingerprintKey: Buffer.from(options.keys.fingerprintKey),
    };
    createJsonProtection(keys);
    const workerOptions: OutboxOptions = {
      client: options.client,
      database: options.database,
      namespace: options.namespace,
      clock: options.clock,
      policy,
      renewal,
      keys,
    };
    const routes = options.routes.map((route) =>
      createManagedConsumer({ route, policy: managedPolicy, wait: options.consumerWait }),
    );
    type Worker = Awaited<ReturnType<typeof openOutboxWorker>>;
    let worker: Worker | undefined;
    let opening: Promise<Worker> | undefined;
    async function getWorker(): Promise<Worker> {
      if (worker) return worker;
      if (!opening) {
        opening = openOutboxWorker(workerOptions).then((opened) => {
          worker = opened;
          return opened;
        });
      }
      try {
        return await opening;
      } catch (error) {
        if (error instanceof OutboxError) throw error;
        throw new OutboxError('STORAGE_UNAVAILABLE');
      } finally {
        // A failed opening must be attempted again by the runner's bounded retry.
        opening = undefined;
      }
    }
    return Object.freeze(
      createOutboxRunner({
        worker: {
          async runOnce(workerId, handler) {
            return (await getWorker()).runOnce(workerId, handler);
          },
        },
        workerId: options.workerId,
        policy: runnerPolicy,
        routes,
        wait: options.runnerWait,
      }),
    );
  } catch {
    throw new DeliveryRuntimeError('INVALID_CONFIGURATION');
  }
}
