# Bounded delivery lease renewal

Implementation: `elatetrips-node/src/modules/foundation/outbox.ts` and the runner's
control forwarding in `outbox-runner.ts`. This DEV-008 technical slice lets a
trusted active consumer extend its own live delivery lease. The foundation remains
unmounted. No provider, process timer or application route starts automatically.

## Explicit configuration and capability

`openOutboxWorker` accepts an optional `renewal` policy containing `policyId`,
`revision`, `maxExtensions` and `maxLifetimeMs`. Omitting it disables renewal.
Limits have no commercial/default values: zero extensions explicitly permits none,
and maximum lifetime must be at least the configured delivery lease duration.
Configuration is validated and detached from caller mutation when opening the
worker. The lifetime starts at that attempt's original claim time and includes
source loading and consumer execution.

The worker supplies its trusted callback with a second optional `DeliveryControl`
argument. Existing one-argument consumers remain compatible. The real worker always
provides this control to an authenticated event's consumer; an older/custom worker
port may omit it. The runner forwards it to the route's optional third argument,
after the existing message and cancellation signal. The control contains only
`renewLease()` and is frozen. No token, database handle or requested expiry is
exposed. This process-local capability must never become a browser/API input.

The worker starts no heartbeat. A configured trusted consumer can await renewal,
or a host can explicitly invoke the [managed wrapper](managed-consumer.md) for
configured heartbeats and cooperative deadlines. No application startup is mounted.
The method returns one of
`renewed` (with the new ISO expiry), `unchanged`, `limit_reached`, `lease_lost`,
`disabled` or `closed`. A stopped/failed consumer must not continue external work
merely because it retained this function.

## State transition and fencing

Each renewal uses the same Mongo snapshot/primary/majority transaction discipline as
claiming and completion. It reloads and validates queue format 2, then verifies the
exact active state, queue version, worker ID, private token and unexpired lease.
Equality with expiry is already lost. A replacement using the same worker name
cannot be mistaken for the original lease. Once this capability observes loss,
subsequent renewal/completion cannot revive it even if the supplied clock reverses.

A successful extension sets expiry to the earlier of server time plus the existing
delivery lease duration and the original claim time plus maximum lifetime. It must
strictly increase expiry. An early/no-change request spends no extension budget and
writes nothing. Hitting the configured count/lifetime cap writes nothing. An expired
or replaced lease cannot use renewal to reclaim itself or reset attempts.

Queue replacement and the immutable `lease_renewed` journal entry commit together.
The row keeps its event/token/worker/state, attempts, total attempts and recovery
count. Only queue version and lease expiry change. The journal retains worker,
timestamp, delivery policy, renewal policy identity/revision and before/after
metadata. It contains no private lease token, event payload or exception body. No
shared business contract or queue-format migration is introduced.

Concurrent requests through one control are serialized. The worker retains the
last committed lease version for completion, so its own renewal cannot fence out
its eventual acknowledgment or failure transition. Mongo transaction retries do
not spend an extension unless its transition commits. Accepted requests drain before
completion, including a call whose consumer forgot to await it. Renewal failure
prevents acknowledgment even if the consumer catches or ignores the failed call;
the worker emits its fixed typed error and leaves the lease for normal recovery.
After the consumer settles, new control calls return `closed` without touching DB.

## Acceptance evidence and limits

Twenty disposable real-Mongo cases cover disabled configuration, live exclusion
past original expiry, policy/audit privacy, no-op and configured limits, clipped
lifetime, concurrent calls, unawaited requests, closed controls, exact expiry,
same-name replacement, reopened workers, failure scheduling after renewal, queue
and audit rollback, ignored storage failures, clock/overflow/corrupt metadata,
configuration detachment and runner forwarding. Fixture assertion failures are
re-thrown outside the worker's normal consumer-error boundary so they cannot be
mistaken for expected delivery failures.

Actual typecheck/full-suite/build results are retained in `evidence/renewal/`; see
[verification.md](verification.md) for the latest comparison. Older evidence folders
remain historical snapshots. The existing RFQ comparison failure and absent backend
lint/test:contracts scripts still prevent full Definition of Done.

Renewal reduces avoidable overlap while a consumer is healthy; it does not provide
exactly-once external effects, ordering, forced cancellation or consumer deadlines.
Crashes, stalled work, clock skew and lease loss still permit replay. Providers and
durable consumers must deduplicate using the stable event ID. Production policy,
clock synchronization, heartbeat/deadline sizing, approved consumers, process
supervision and application wiring remain pending. No live database, notification
or deployment is used. Full BRD, DEV-005/006/008 and R1/R2 remain incomplete.
