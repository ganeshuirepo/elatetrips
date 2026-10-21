# Recoverable outbox delivery foundation

Implementation: `elatetrips-node/src/modules/foundation/outbox.ts` and
`outbox-record.ts`. This extends the DEV-006 queue foundation and supplies the
delivery prerequisite for DEV-008. Business projections and provider adapters remain
separate work. No shared contract is adopted or modified.

## Explicit invocation and configuration

`openOutboxWorker` receives a Mongo client, explicit database/namespace, storage keys,
server clock and a required versioned delivery policy. The policy contains
`policyId`, positive `revision`, `leaseDurationMs`, `maxAttempts` and one
`retryDelaysMs` entry for each possible retry. There are no retry/lease defaults,
provider credentials, global connections, timers, polling loops or HTTP routes.
Policy data is detached from caller mutation when the worker opens.

`runOnce(workerId, handler)` processes at most one due or expired entry. The worker
ID is a trusted server process identifier, never a user-provided role or identity.
The handler is a trusted internal adapter, not an end-user callback. A standalone
Mongo deployment is rejected before collection/index creation. A replica set or
sharded deployment with logical sessions is required.

The persistence producer now creates local queue format 2 with zero per-cycle and
lifetime attempts, zero recoveries,
pending state and its availability timestamp in the same transaction as the record,
revision, encrypted audit and receipt. No production database has used this new
adapter and no live migration is performed. Older unversioned/format-1 development
rows require explicit rebuilding/migration; the worker does not infer missing
availability fields or upgrade unknown formats.

## State and concurrency

| Transition | Condition |
| --- | --- |
| pending → leased | Availability reached and attempt budget remains |
| leased → leased | Previous lease expired and another attempt remains |
| leased → delivered | Handler succeeded; lease token/version still current and unexpired |
| leased → pending | Handler failed and a configured retry remains |
| leased → dead | Invalid authenticated event or failed final attempt |
| pending/expired leased → dead | Current versioned policy's attempt budget is exhausted |

A claim runs in a Mongo transaction with snapshot reads, primary read preference
and majority write concern. It increments the attempt count and queue version and
generates a fresh lease token. A matching event/version unique index protects the
delivery journal. Mongo write conflicts retry the database transaction; they never
execute the handler inside that transaction.

Each transition replaces the queue row using its previous version/state/lease token
and appends a delivery audit in the same transaction. The audit records worker,
role, timestamp, policy ID/revision, reason and before/after metadata. It omits lease
tokens, business payload and raw provider errors. The API exposes no journal update
or delete. Production database roles must enforce that collection boundary.

The handler runs after the claim commits. Completion uses a second transaction and
requires the original worker/token/version and an unexpired lease. A late worker
receives `lease_lost` and cannot acknowledge or reschedule a newer lease, even when
both processes use the same worker ID. Failed claim or completion journal inserts
roll the corresponding queue change back. A handler failure retains only
`DELIVERY_FAILED`; exhausted lost leases retain `LEASE_EXPIRED`.

Retry availability is based on the failure timestamp plus the configured delay.
Reducing an attempt limit in a newer policy can terminalize an already pending job;
the journal identifies that policy revision and retains the original failure reason.
Dead entries can now use a separately authorized recovery port with versioned
configuration, caps and an atomic operator journal/receipt; see [recovery.md](recovery.md).
The worker still exposes no automatic reset or source-event repair.

## Event authentication and delivery semantics

Before dispatch, the worker reads the immutable event with majority read concern
from the primary. AES-GCM additional data binds its body to database, namespace,
event ID, aggregate and revision. Runtime validation then checks the body's event
ID/aggregate/revision against that stored envelope. Missing, malformed, tampered or
undecryptable events become dead with `INVALID_EVENT` and never reach a handler.
Restoring missing read keys or correcting configuration does not automatically
reactivate quarantined events.

The handler receives the stable `eventId`, immutable source `occurredAt`, per-attempt
`receivedAt` and the authenticated local foundation event. The full event contains
private before/after content and must stay within trusted adapters. An approved
supplier/provider adapter must validate and mask its own outgoing contract.

Delivery is **at least once**. A process can complete an external operation and lose
its lease or fail before acknowledgment. Recovery may invoke a handler again with
the same event ID. Consumers must persist their own deduplication/projection receipt
atomically with their state change; providers need their own stable idempotency key.
No ordering across events is promised. Domain consumers must reject stale revisions
or defer gaps. A replay-safe local snapshot consumer is now implemented and tested
with this worker; see [projection.md](projection.md). This does not certify external
provider ingestion or booking/financial state machines.

The clock must be server-owned and consistent across deployed workers. Optional
configured bounded renewal is now available through the active consumer's private
control; see [renewal.md](renewal.md). The worker itself starts no heartbeat; an
explicitly invoked [managed wrapper](managed-consumer.md) can supply configured
heartbeats and cooperative deadlines. No application startup is mounted. The
unmounted runner supplies explicit routing/polling; see [runner.md](runner.md).
Production time/failover behavior, route deployment, scheduling, key management, least-privilege/index provisioning,
retention and operational replay remain integration work.

## Evidence

Thirty acceptance cases run against disposable real local MongoDB processes.
They cover parallel claims, fixed retry dates, final-attempt failure, policy changes,
same-ID worker fencing, client loss/reconnection, lease-expiry boundaries, event
authentication/quarantine, configuration/clock errors, unique indexes and standalone
rejection. Server validators force claim, acknowledgment, retry and quarantine
journal failures and queue replacement failures to prove atomic rollback.

`evidence/outbox/` retains typecheck, complete backend test and build output. All
110 foundation tests pass. Full backend suite: 352 pass and the same one pre-existing
RFQ comparison failure; typecheck and build pass. Backend lint/test:contracts scripts
remain absent. No production provider, message, deployment or database is used.
