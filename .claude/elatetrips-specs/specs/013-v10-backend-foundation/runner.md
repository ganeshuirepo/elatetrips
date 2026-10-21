# Explicit outbox runner

Implementation: `elatetrips-node/src/modules/foundation/outbox-runner.ts`.
This DEV-008 technical slice composes the existing transactional worker and trusted
consumers into a sequential polling lifecycle. Importing or constructing it starts
no connection, claim, timer or consumer. The application does not mount this runner.

## Configuration and routing

`createOutboxRunner` requires an already opened worker, a server-owned worker ID,
an explicit versioned policy and a route table. Policy supplies `enabled`,
`idleDelayMs`, `workDelayMs` and `storageRetryDelaysMs`; no production cadence is
built in. Disabled policy performs no work. The storage-delay array bounds retries
of consecutive infrastructure failures; an empty array permits none. A successful
worker iteration resets that consecutive-error budget. Idle and storage delays
must be positive. Delays above Node's signed 32-bit timer range fail validation
because Node would clamp them to 1ms. A zero work delay still yields via a Node
timer. An injected abortable scheduler supports deterministic host tests.

Each route matches the authenticated source event's exact `kind` and
`schemaVersion`. Pair keys cannot collide through delimiter characters. Duplicate
routes fail configuration; there is no wildcard or fallback handler. Route entries
and policy data are detached from subsequent caller mutation. Unmapped events throw
back to the existing worker, which records its fixed failure code and configured
retry/exhaustion transitions. They are never acknowledged as successful. A host must
configure the complete route table for the worker's queue: this is not a filtered
subscription or per-consumer fan-out queue. An empty table invokes no consumer but
will exhaust queued events if explicitly run with an enabled policy.

The runner adds no business schema, reducer, price, provider or external transport.
A trusted route can call the existing snapshot projection's `apply(eventId)`; that
projection independently reloads and authenticates the source. Consumers remain
responsible for durable event-ID deduplication and ordering. Multiple intended
durable consumers require a separately designed idempotent composition/fan-out
protocol; routing does not create independent delivery receipts for them.

## Lifecycle, shutdown and errors

The host explicitly awaits `runner.run(abortController.signal)`. A runner is
single-use: concurrent starts and restarts reject, including after disable/failure.
Create a fresh runner to resume processing. There is only one awaited `runOnce` at
a time in that runner. Other worker processes retain the existing Mongo lease
coordination and fencing. A pre-aborted signal starts no claim.

Abort interrupts idle/backoff timers and prevents the next claim. If a claim was
already underway, its callback checks cancellation before invoking a consumer;
the existing worker journals that failed attempt and schedules retry/exhaustion.
An active consumer receives the same signal. Shutdown awaits that consumer and its
durable acknowledgment; it cannot force a provider or database promise to stop.
If the consumer completes successfully after abort, its delivery is acknowledged.
If it cooperatively throws, the worker records a normal failed delivery. No next
claim starts in either case. A host should await completion before closing Mongo.

Only typed `OutboxError('STORAGE_UNAVAILABLE')` failures consume the configured
infrastructure retry schedule. Permanent worker errors, malformed worker results,
unexpected exceptions and exhausted schedules fault with `WORKER_FAILED`; scheduler
errors fault with `WAIT_FAILED`. Raw URIs, provider exceptions and cancellation
reasons are excluded from these errors and the runner report. Handler errors remain
under the worker's existing fixed-code transactional failure handling.

`snapshot()` returns detached process-local policy/worker identity, lifecycle state
and counters for worker outcomes, storage failures and unroutable events. It exposes
no source payload, event/contact identifiers, tokens or exception bodies. These are
ephemeral diagnostics, not durable audit evidence. Every durable queue transition
still commits with the existing append-only worker journal. Constructing/stopping
this runtime changes no business record or stored configuration.

The runner forwards the worker's optional `DeliveryControl` as a third route argument.
See [renewal.md](renewal.md) for explicitly configured bounded lease extensions. The
runner itself installs no heartbeat, deadline, process restart or signal handler.
An explicitly invoked [managed wrapper](managed-consumer.md) supplies configured
heartbeats and deadlines; [delivery runtime](delivery-runtime.md) composes those
ports without mounting application startup. A consumer exceeding its lease without successful renewal can
lose acknowledgment and run again elsewhere. Cancellation cannot roll back a side
effect. Existing at-least-once semantics and provider idempotency requirements apply.

## Acceptance and remaining integration

Seventeen lifecycle cases cover inactive construction/disable/pre-abort, timer
cancellation, exact routing/collisions, single-use starts, configured pacing,
bounded/reset infrastructure retries, scheduler errors, redacted failures,
configuration validation and detached reports. Eight disposable real-Mongo cases
cover producer-to-projection delivery, shutdown during claim/consumer, cooperative
cancellation, unroutable-event exhaustion, restart with remaining work, lease loss
and replay after projection commit without duplicate projection effects.

Production policy, complete approved route tables/business consumers, process
supervision, monitoring, lease/deadline sizing, provider idempotency and application
startup/shutdown wiring remain pending. The runner is unmounted; no notification,
production database or deployment is used. See `evidence/runner/` and
[verification.md](verification.md) for actual checks. DEV-005/006/008, full BRD
acceptance and R1/R2 remain incomplete.
