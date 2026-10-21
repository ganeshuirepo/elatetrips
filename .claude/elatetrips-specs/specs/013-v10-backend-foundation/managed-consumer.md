# Configurable managed-consumer lifecycle

`src/modules/foundation/managed-consumer.ts` exports `createManagedConsumer`, an
explicit trusted route wrapper compatible with the runner's existing exact
kind/schema route interface. Construction starts no timer, connection, consumer or
runner. No application route, startup job or provider is mounted.

Required configuration supplies a policy ID/revision, enabled flag, heartbeat
interval and deadline in milliseconds. Timer values reject Node's overflowing or
clamped range. Policy and route handler are detached at construction. Disabled
configuration rejects invocation without calling the consumer or acknowledging
delivery. A live worker renewal control is required; older/custom worker ports
without that capability fail closed. The host must configure the worker's
separate renewal policy consistently with approved lease/heartbeat/deadline limits.
The wrapper does not infer those operational values or relax worker limits.

The supplied handler receives the original message/control and a child cancellation
signal. Sequential heartbeats begin after the configured interval, never overlap,
and accept only renewed/unchanged results. Disabled, closed, capped or lost renewal
aborts the child; renewal/storage errors, scheduler failures and handler failures
become fixed typed errors without private exception content. Host cancellation and
deadline expiry also abort the child. The first failure remains authoritative even
if cleanup later fails. Raw host cancellation reasons are not forwarded.

Success stops future heartbeat waits, drains an already accepted renewal and then
cleans up the deadline wait and host listener. The deadline remains active through
renewal drain. Cancellation or lease failure during that drain still prevents
success. Failure cancels waits but also drains both the consumer and active renewal
before returning to the worker, so acknowledgment cannot race continued managed
work. Worker queue transitions and renewal audit remain the existing atomic worker
operations; this wrapper introduces no new durable mutation or shared contract.

Cancellation is cooperative. A handler that ignores its signal may hold shutdown
indefinitely; the wrapper neither forcibly interrupts JavaScript nor undoes a
provider side effect. A heartbeat awaiting a database call must also drain. Every
consumer/provider still needs stable-event-ID idempotency. Deadline/cancellation
cannot ensure exactly-once external effects. A host should give process supervision
its own approved shutdown policy, and trusted scheduler overrides must honor abort.

The focused suite has 31 cases: 26 lifecycle cases and five disposable real-Mongo
cases. It covers scheduler cleanup, actual Node timer abort, slow renewals, all
renewal stop results, fixed error reasons, first-failure preservation, independent
invocations, consumer cleanup drain, and deadline/abort/lease-loss after consumer
success while renewal is in flight. Real transactions prove renewed-version
acknowledgment and replacement exclusion, deadline retry, replacement fencing,
disabled renewal retry, and queue/audit rollback after renewal audit failure.
Integration assertions occur outside the worker handler boundary, so failures
cannot be mistaken for an expected consumer exception.

Actual focused/typecheck/build logs and summary are in `evidence/managed-consumer/`.
Full-suite/aggregate results are in [sequential-verification.md](sequential-verification.md)
and `evidence/sequential/`. Production routes, policies, supervision, provider adapters, canonical
contract adoption and remaining DEV-005/006/008 acceptance remain pending.
