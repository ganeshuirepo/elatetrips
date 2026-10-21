# 013 — v10 backend foundation (DEV-005/006/008 technical slices)

Source: user-supplied v10 backlog/plan and full BRD revision 9. Backend checkout
confirmed by user at `D:/projects/elatetrips-next/elatetrips-node` (nested in the
elatetrips-next Git repository). Isolated branch `feature/013-v10-backend-foundation`
starts at `ce83482`; original checkout and its local deployment file are untouched.

## Ownership and scope

Owns new `elatetrips-node/src/modules/foundation/`, this spec/evidence folder and
the existing JWT adapter `src/modules/auth/token.service.ts` with its new tests.
Scoped reads: auth token interface/guard and central env/TypeScript/test configuration.
No partner/admin/business module source reads or edits. Shared canonical contracts
and constitution remain unchanged; proposed new API/entity integration awaits owner
contract adoption. This is Express/Node work; no Next.js code is written.

## Findings to verify

- Current JWT payload is the legacy `{phone}` identity, not a stable user ID or
  organization/partner role. It must resolve through active server account data.
- Verification currently asserts a token type without checking the runtime phone
  type. Scope-tagged tokens belong to other adapters, not the user identity port.
- The current env has configurable signup auto-activation; no inference of verified
  phone/OTP or partner activation can be made from an active account alone.
- Console/card adapters remain separate; this feature grants no card-to-portal
  privilege and does not alter money-affecting OTP protections.

## Acceptance criteria

1. Legacy valid user tokens round-trip; malformed phone values, incorrect signature,
   expired tokens, alternate signing algorithms and explicitly scope-tagged tokens
   fail through the existing UnauthorizedError boundary.
2. A verified user credential resolves to an active stable account ID using a
   server-owned lookup port. Inactive/missing accounts and lookup failure deny access.
3. Resource authorization uses current active server membership, exact resource
   scope, expiry and an explicit permission configuration. Empty config denies all.
   No implicit global admin wildcard or role from token/body can grant access.
4. Cross-customer, organization and partner attempts fail; revoking membership takes
   effect on the next check. Invalid policy/time/data and storage failures fail closed.
5. Identity resolution and authorization remain read-only. No new shared API is
   mounted, no production database is accessed and no notification is sent.
6. An unmounted, module-local persistence adapter uses a supplied Mongo client,
   server configuration/schema and current membership directory. Existing scopes
   come from persisted records; creation scopes must come from a server resolver.
   Payload, immutable revision, before/after audit event, outbox reference and
   idempotency receipt commit together in a replica-set/sharded transaction.
7. Expected revisions reject stale/concurrent updates. Reusing a command ID with
   the same normalized input returns its original revision; changed input rejects.
   Append-only record kinds cannot be replaced. No delete or audit update API exists.
8. Payloads and audit contents use authenticated encryption with injected versioned
   keys and record-bound additional data. Missing keys, tampering, unknown schema
   versions and standalone Mongo deployments fail closed. No business policy,
   price, retention duration or retry cadence is introduced by this adapter.
9. Real disposable Mongo replica-set tests prove transaction rollback after an audit
   insert failure, unique indexes, concurrent updates, reconnect/replay, cross-scope
   denials, immutable history and encrypted storage. Test schemas are local fixtures,
   not adoption of the proposed shared domain contracts.
10. An explicitly invoked outbox worker claims entries transactionally with a unique
    lease token and increasing version. Required server configuration supplies lease
    duration, attempt limit and retry delays. Expired leases are recoverable; an old
    worker cannot acknowledge or reschedule a newer lease. Terminal exhaustion is
    explicit. Every delivery-state transition has an atomic append-only journal.
11. The worker authenticates the encrypted event and its ID/aggregate/revision before
    calling an injected trusted handler. Source and receive times remain distinct.
    Missing/corrupt events never reach a handler; handler exceptions retain only a
    fixed failure code. Acknowledgment/journal failures roll back together.
12. Delivery is at least once: a handler must deduplicate on event ID. No external
    provider, polling loop, route or timer is mounted. Real Mongo tests cover parallel
    claim races, timed retries, worker loss, fencing, failure rollback and replay.
13. A local derived snapshot projection reloads and authenticates the immutable
    source event rather than trusting a callback's payload. It checks configured
    kind/schema, exact scope, contiguous revisions and the before/after chain.
    Gaps defer without writes; stale events cannot regress state; exact duplicates
    are no-ops and changed event intent is rejected.
14. Projection state, encrypted consumer receipt and encrypted append-only projection
    audit commit in one Mongo transaction. Receipt fingerprints bind canonical event
    intent while preserving source time and first successful receipt time separately.
    Authorized reads use fresh current memberships and server-loaded stored scope.
15. Real Mongo tests cover duplicate/competing consumers, out-of-order gap recovery,
    atomic failure rollback, restart/replay, scope denial, encrypted integrity and an
    end-to-end producer/outbox/projection flow where acknowledgment is lost after
    the projection commits. No business state machine/provider route is enabled.
16. A trusted multi-record coordinator uses registered foundation stores sharing
    one client/database/namespace. It authorizes every record's server scope, checks
    revisions and runs a required pure synchronous guard over detached snapshots.
    Versioned configuration supplies the guard identity and maximum record count;
    no inventory, price or financial policy is built in.
17. All records, immutable versions, audits, outbox entries, record receipts and an
    encrypted group receipt commit together. Exact group retries return original
    versions after fresh authorization; changed group intent rejects. Batch-local
    receipt context prevents independently committed subcommands being mistaken for
    an atomic group. One failing guard, permission, revision or insert aborts all.
18. Real Mongo tests cover multiple kinds, partial-failure rollback, competing
    groups, current scope revocation, guard isolation, idempotent restart/replay and
    compatibility with existing record readers/outbox/projection consumers. No domain
    booking/inventory/financial operation is mounted by this technical coordinator.
    A group read authorizes each existing record and uses one database snapshot;
    concurrent commits cannot produce a mix of revisions in that returned group.
19. A local recovery port authenticates an event's stored scope and requires fresh
    explicit delivery.read/delivery.retry permissions. Inspection returns metadata
    without business payload or lease tokens. Retry is gated by required versioned
    configuration, a configured reason code, expected queue version and recovery cap.
20. Only dead deliveries can be retried, preserving event ID, monotonic queue version,
    lifetime attempts and recovery history. A retry resets only the per-cycle attempt
    count and commits queue/audit/encrypted command receipt atomically. Exact command
    replay returns its prior result after fresh authorization; changed intent fails.
21. Real Mongo tests cover permissions, corruption, concurrent retries, old-worker
    fencing, recovery limits, insert rollback and producer/outbox/projection recovery.
    Queue format 2 adds explicit lifetime/recovery counters; older layouts are not
    silently upgraded. No operational route, provider or scheduler is mounted.
22. An explicitly invoked sequential runner requires a versioned enabled/pacing/
    infrastructure-retry policy and exact kind/schema routes. No work begins at
    construction; disabled configuration invokes no worker. Duplicate routes fail;
    unknown events use worker retry/exhaustion rather than successful acknowledgment.
23. The single-use runner rejects overlapping starts, interrupts idle/backoff waits
    on cancellation, avoids another claim and awaits an active consumer/acknowledgment.
    Consumers receive the host signal; stopping cannot undo an external effect.
    Typed storage failures have a bounded configured retry schedule. Unexpected errors
    and malformed worker results fail through redacted typed errors. Detached reports
    contain process-local counters without source content, tokens or exception bodies.
24. Lifecycle and real-Mongo tests verify routing, shutdown during claim/consumer,
    finite/reset storage retries, restart with pending work and producer/projection
    replay without a duplicate durable projection effect. No runner is mounted into
    application startup; production supervision, handlers and policy remain pending.
25. An explicit optional renewal policy supplies versioned identity, maximum extension
    count and maximum lifetime from the original claim. Absent configuration disables
    renewal. Only the active consumer's process-local control may extend a live lease;
    exact token/version/worker checks prevent expired/replaced lease revival.
26. Successful renewal increases expiry/version within both configured limits and
    commits an immutable before/after worker audit atomically. Attempts and lifetime
    attempt/recovery counters are unchanged. Concurrent calls serialize; accepted
    calls drain before acknowledgment and failures prevent acknowledgment. Calls
    after consumer settlement are closed. No-change/cap/loss results write nothing.
27. Real Mongo cases prove limits, fencing, concurrent calls, completion/failure after
    renewal, queue/audit rollback, invalid time/metadata and runner forwarding. No
    application heartbeat, external side effect or application route is mounted.
28. An opt-in trusted route wrapper requires versioned enabled/heartbeat/deadline
    configuration and a worker renewal capability. Construction starts no work;
    disabled invocation fails without acknowledgment. Sequential heartbeats stop on
    lease loss/cap/error, and host cancellation/deadline signal cooperative cleanup.
29. Consumer and accepted renewal work drain before returning to the worker. The
    deadline remains active through renewal drain; cancellation or lease failure
    after consumer success still prevents acknowledgment. Timers/listeners clean up,
    errors omit private details, and concurrent invocations have independent state.
    No forced cancellation or exactly-once provider guarantee is introduced.
30. Lifecycle and real-Mongo tests prove deadline retry, renewed-version acknowledgment,
    replacement exclusion/fencing and renewal audit failure rollback. The wrapper is
    unmounted; operational policies and production application wiring remain pending.

31. A separate read-only delivery-history port requires versioned page bounds and
    explicit default-deny history permission, plus an additional current permission
    for actor/reason/policy details. Authenticated source scope is authoritative;
    every continuation rechecks memberships, and output omits tokens/business content.
32. Snapshot reads capture a queue/journal watermark; encrypted continuation binds
    user, event, source, full read policy, detail mode and prior/watermark snapshots.
    Bounded pages validate strict contiguous transitions and before/after links;
    queue and saved anchors must agree. Later deliveries cannot enter old pages.
33. Real Mongo cases prove full failure/recovery/renewal/success replay, concurrent
    read consistency, watermark stability, permission revocation, corruption and
    privacy. Opening/reading creates no indexes or writes. Integrity claims cover
    checked rows/anchors only; plaintext delivery history is not cryptographically
    authenticated, and unseen older rows are not scanned.

34. Explicit managed delivery assembly validates all host policies, route identities
    and key material without database, index, scheduler or consumer activity.
    Enabled configurations require unique nonempty routes, enabled managed policy,
    renewal, heartbeat shorter than lease, lifetime at least deadline plus lease,
    and extensions at least ceil(deadline/heartbeat) plus one. Caller mutations
    cannot alter the validated storage configuration, policy arrays, keys or routes.
35. Assembly reuses the existing runner through a lazy worker port. Disabled or
    pre-aborted runs never initialize storage; successful initialization is reused,
    and failed initialization is retried under existing bounded storage semantics
    without retaining a rejected opening promise. Errors are redacted, and the
    caller retains ownership of the Mongo client. No application mounting occurs.
36. Focused lifecycle and real Mongo composition cases prove source production,
    managed renewal, projection and acknowledgment, initialization recovery,
    cancellation/deadline cleanup, mutation isolation and standalone refusal.
    Compatibility bounds do not guarantee ownership under slow storage, event-loop
    stalls or clock movement; cancellation and provider idempotency remain explicit
    trusted-consumer responsibilities.

## Deferred integration and persistence

DEV-005 production integration requires approved new contracts, real account and
membership adapters, server route wiring and signed-card/OTP compatibility tests.
DEV-006 production integration additionally requires approved canonical records,
actual server account/resource/membership adapters, migration and retention/key
management, least-privilege database roles, and the production deployment's
transaction capability. A local replica-set fixture does not establish production
readiness, atomic membership revocation, external provider idempotency or domain
state machine validation. The outbox worker and replay-safe snapshot mirror are
unmounted technical adapters. A scoped recovery port is also implemented, while
production handlers, routes/UI, scheduler deployment, recovery policy deployment and governed
source/queue migration/repair procedures remain pending.
An explicit unmounted sequential runner provides local routing, polling and shutdown;
it forwards an optional bounded lease-renewal capability to trusted consumers. No
application heartbeat or provider is mounted. An opt-in managed route supplies
configured heartbeats and cooperative deadlines when explicitly invoked; external
provider idempotency remains the consumer's responsibility.
Frozen contracts remain untouched.
