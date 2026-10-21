# Scoped delivery inspection and recovery

Implementation: `elatetrips-node/src/modules/foundation/delivery-recovery.ts`.
This is an unmounted DEV-008 operational primitive for the existing outbox. It
inspects delivery metadata and queues an explicitly authorized retry. It does not
call a provider, edit a source event, create a business command or install a route.

## Identity, scope and configuration

`openDeliveryRecovery` requires an explicit Mongo client/database/namespace, storage
keys, server clock, current membership directory, permission-policy loader and
versioned recovery policy. The latter supplies `policyId`, `revision`, `retryEnabled`,
`maxRecoveriesPerEvent`, `retryDelayMs` and unique allowed `reasonCodes`. There are
no live recovery defaults. Disabled recovery, zero budget or absent reason codes
prevent a new retry. Limits/delays/reasons are configuration rather than business
constants in the engine.

The local identity engine now recognizes `delivery.read` and `delivery.retry`.
Neither action has a default grant. Each operation requires a request-local verified
principal and a current exact-scoped server membership with the explicit configured
action. Being the source actor, possessing a serialized principal or a browser role
claim cannot grant operator access. The existing customer/organization/partner
scope rules remain in force; this adds no implicit global admin bypass.

Scope comes from the authenticated immutable source event. It is never accepted
from the retry body or mutable queue metadata. If a queued source event is missing,
tampered or undecryptable, inspection/recovery fails closed. This port cannot repair
it. Restoring the original authentic event from a separately governed backup/repair
process is a prerequisite to recovering such quarantine. The test suite simulates
that restoration only inside a disposable database.

## Inspection and retry

`inspect(principal, eventId)` returns source kind/aggregate/revision/time plus queue
state, version, per-cycle/lifetime attempts, recovery count, availability/lease/
delivery times and a fixed failure code. It returns no business before/after payload,
worker identity, lease token, contact data or provider exception. Reads use one Mongo
snapshot and refresh permissions. A nonexistent event/entry is an empty result.

`retry(principal, {commandId, eventId, expectedVersion, reasonCode})` requires:

- An authentic source and current `delivery.retry` permission.
- Enabled recovery and a configured reason code.
- The expected current queue version and **dead** state.
- Remaining configured recovery budget for that event.

Pending, leased and delivered entries cannot be retried. Even an expired lease must
be resolved by the worker's lease/exhaustion process before operator recovery; the
operator cannot steal it. Successful recovery preserves the event ID and source
intent, increments queue version/recovery count, resets only per-cycle attempts and
sets availability from server time plus the configured delay. The last failure
remains visible until a later successful delivery clears it.

Queue replacement, an append-only delivery audit and encrypted recovery command
receipt commit in one snapshot/primary/majority Mongo transaction. A rejected queue,
audit or receipt write aborts all three. The audit retains operator ID, actual role,
membership, timestamp, policy version, configured reason and before/after metadata.
Lease tokens, business payloads and raw provider errors are excluded. The existing
event/version unique journal index also orders operator and worker transitions.

The receipt binds command intent, actor/scope, policy/configuration and the full
authenticated source event using HMAC, with authenticated encrypted storage bound
to its database/namespace/metadata. An exact retry reauthorizes and returns its
original result, including after the worker subsequently delivers the event. It
does not reset or resend anything. Changed intent/configuration/source content
rejects the consumed command ID. Corrupt receipts and impossible counters fail
through fixed typed errors. API adapters still need approved error mappings.

## Queue format and delivery semantics

Queue **format 2** adds `totalAttempts` and `recoveryCount`. The worker increments
per-cycle attempts and lifetime attempts together on each claim. An operator retry
preserves lifetime attempts and monotonic version while beginning a new cycle.
Every previous cycle stays in the immutable delivery journal. Invalid combinations,
such as a completed/dead/leased cycle with zero attempts, are rejected.

The producer, worker and recovery port now use format 2. Format 1 and unversioned
rows are not silently upgraded. No production database has used this new foundation
and no live migration is performed. A future deployed migration must explicitly
reconstruct/verify counters from its known layout/history and preserve journal data.
The immutable source-event protocol is unchanged by this queue-metadata revision.

Old workers remain fenced by token/version after recovery, including when process
names are reused. Delivery remains at least once, and source event IDs stay stable
for consumer/provider deduplication. The integration suite applies a projection,
simulates a post-commit acknowledgment failure, recovers the dead delivery and
processes it again with exactly one durable projection change. This does not
certify external provider idempotency or authorize new financial side effects.

## Evidence and remaining scope

Thirty-seven acceptance cases use disposable real MongoDB. They cover metadata
privacy, configured delays/budgets, exact and competing retries, permission changes,
all scope denials, invalid principals, source/receipt/counter corruption, active/late
workers, original-source restoration, client reconnection and queue/journal/receipt
rollback using server validators. Existing outbox/projection/transaction tests also
pass under format 2.

`evidence/recovery/` retains actual typecheck/full test/build output. Typecheck and
build pass. All 220 added foundation tests pass; the full backend has 462 passes
and the same one pre-existing RFQ comparison failure. Backend lint/test:contracts
scripts remain absent.

Production operator policy/identity adapters, approved routes/UI, source backup/repair
and queue migration procedures, provider idempotency, worker scheduling, keys/retention/
least-privilege DB roles and production deployment checks remain pending. No provider,
notification, production database or deployment was used. Full BRD, DEV-005/006/008
and R1/R2 remain incomplete.
