# Managed delivery runtime composition

`src/modules/foundation/delivery-runtime.ts` exports `createDeliveryRuntime`, an
explicit assembly of the existing outbox worker, managed route wrappers and
sequential runner. It returns the runner's frozen `snapshot()`/`run(signal)` port.
No application startup, background job, route or provider is mounted. Construction
does not access Mongo, create indexes, schedule timers or invoke consumers.

The host supplies a Mongo client, database/namespace, storage keys, clock, worker
identity, exact kind/schema routes, delivery policy, runner policy and managed
policy. Enabled runtimes require a renewal policy and at least one route. Duplicate
or malformed routes are rejected. All schemas and consistency checks run before
database access. Invalid configuration emits only `INVALID_CONFIGURATION`, without
raw errors or secrets. Every configured policy remains explicit; there are no
production timing, provider, role or business-policy defaults.

Enabled configurations must have an enabled managed policy, a heartbeat interval
strictly shorter than the delivery lease, and both conservative technical bounds:

- Renewal lifetime is at least managed deadline plus one delivery lease.
- Maximum extensions are at least `ceil(deadline / heartbeat interval) + 1`.

The extra extension handles a deadline/heartbeat scheduling tie without exhausting
the cap; lifetime headroom avoids reaching the lifetime cap during the intended
consumer runtime. These checks validate compatibility of host-supplied limits,
not production cadence. Renewal budgets start at the original claim, while managed
timers start at the handler boundary. Source-loading time, database latency, event
loop stalls, clock movement and shutdown drain can still exceed the live lease or
lifetime. Bounds cannot promise uninterrupted ownership or successful renewal.

Policy arrays, route identity/handler references, scalar storage configuration and
key buffers/maps are detached at construction. Mutating the caller's objects cannot
change the validated runtime before lazy initialization. Mongo, clock, scheduler
functions and handler functions are trusted server capabilities; their own behavior
and captured state remain host responsibilities. Optional `runnerWait` and
`consumerWait` ports must honor cancellation.

Only the runner's first actual iteration opens the worker. Disabled and pre-aborted
runs never initialize it. A successful worker is reused; a rejected opening is
cleared, allowing the runner's finite configured storage-retry schedule to perform
a fresh initialization. Opening failures retain the worker's typed classification,
and unexpected exceptions become redacted storage errors. Unsupported standalone
Mongo fails without storage retries or queue/index creation. The wrapper never
connects or closes the caller's shared client; configure driver selection/socket
timeouts on that client. No independent scheduler or lifecycle state machine is
introduced.

Consumer cancellation, heartbeats, renewal drain, deadline and acknowledgment use
the existing managed wrapper and worker semantics. Cancellation is cooperative;
handlers that ignore their signal and slow database requests can delay shutdown.
Provider effects still require stable-event-ID idempotency. Source authentication,
transactional worker audits, lease fencing and projection receipts remain in the
existing adapters, with no alternate business event contract.

Focused verification adds 28 cases: 22 configuration/lazy lifecycle cases and six
disposable Mongo composition cases. The latter cover producer-to-managed-worker
renewal-to-projection acknowledgment, detached key/policy/route mutations, successful
reopening after transient initialization failure, host cancellation, managed
deadline cleanup, shared-client ownership and standalone rejection. Unavailable
storage and injected private errors exercise bounded redacted initialization
failure. Typecheck and build pass. Logs are retained in
`evidence/delivery-runtime/`; reproduce with
`node .claude/elatetrips-specs/specs/013-v10-backend-foundation/runtime-checks.mjs`.

Aggregate/full-suite verification is retained in `evidence/sequential/` and
[sequential-verification.md](sequential-verification.md).
Canonical contract adoption, production handler and account/resource adapters,
operational policy approval, supervision, retention/keys/database roles and actual
deployment certification remain pending. DEV-005/006/008 and R1/R2 are incomplete.
