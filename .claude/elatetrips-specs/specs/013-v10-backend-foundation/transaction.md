# Atomic multi-record command foundation

Implementation: `openRecordTransaction` in
`elatetrips-node/src/modules/foundation/persistence.ts`. Single-record and group
writes share the same staging/commit implementation. The existing record format,
encrypted versions, events and outbox protocol are preserved. This is a DEV-006/008
technical mechanism; no booking, inventory or financial operation is mounted.

## Trusted participants and required rules

The coordinator takes an explicit Mongo client/database/namespace, storage keys,
server clock, versioned policy and pure synchronous validation function. Policy
contains `policyId`, positive `revision` and `maxRecords`. No default group size,
price, inventory allocation or financial policy is supplied. Guard code/configuration
must be versioned through that policy identity; it must perform no IO or side effects.

Only actual stores created by this module can participate. A module-private WeakMap
retains their capabilities; serialized or copied store-shaped objects cannot join.
Every participant must use the exact same client, database and namespace. A client
connected to the same URI is still a different transaction/session owner and cannot
be mixed into the group.

`write(principal, {commandId, correlationId, changes})` accepts trusted store
references and record IDs, expected revisions, payloads and optional server-resolved
creation scopes. Each store validates and detaches its own payload using its strict
installed schema. Duplicate record targets are rejected. Record sets are sorted by
kind/ID, so reversing input order preserves intent and yields the same result order.
No endpoint accepts these objects or browser-provided store capabilities.

Within one database transaction, all current records are loaded from its snapshot,
their exact stored scopes are authorized against fresh memberships and configured
write actions, and payload encryption/versions/modes are authenticated. Creation
scopes must come from server ownership resolvers. The coordinator checks every
expected revision and append-only constraint before running the configured guard.
The guard sees detached, deeply frozen before/after snapshots, scopes, current and
expected revisions, kind and ID. A false result, exception or mutation attempt denies
the group with the fixed `RULE_DENIED` code.

The application guard must enforce domain relationships and invariants over every
relevant participant. The coordinator does not infer which records make a valid
booking or what inventory/money arithmetic should hold. Application services must
route domain writes through their approved guards; the lower-level individual store
write remains available as an infrastructure port.

## Atomic commit and replay

After validation, each participant commits its record, immutable version, encrypted
before/after audit, pending outbox entry and record receipt. An encrypted group
receipt is inserted last in the **same** Mongo transaction. It binds policy/config,
command/correlation IDs, authorized actor/scope and every normalized record intent,
and retains each original result's kind/ID/revision/event reference. The transaction
uses snapshot reads, primary read preference and majority write concern. A replica
set or sharded deployment is required; standalone Mongo is rejected before group
storage initialization.

A group failure rolls all participant writes and receipts back, including when the
last group receipt is rejected after both records have been staged. An immutable
audit is retained for every actual record state change through its normal event.
The group receipt links those events without modifying frozen event contracts.

An exact retry reauthorizes all requested records and authenticates the encrypted
group receipt, then loads its original immutable versions. It does not re-run the
domain guard or reapply updates. Later independent revisions stay intact. Changed
payload, record set, actor/scope, correlation or versioned policy/configuration
rejects the consumed intent. Current and immutable result records must still exist
and authenticate; corruption does not trigger reconstruction or re-execution.

Subcommand IDs are derived from policy/group/record identity, while their receipt
fingerprints also bind the complete group context. A previous independent write
with a matching-looking subcommand ID cannot be adopted as an atomic group. Group
and subreceipts must have committed together. Mongo write conflicts retry database
work only; providers/notifications must never run within a guard or transaction.

`_transaction_receipts` is a new module-local collection with a unique
policy/command index and versioned encrypted receipt body. Business payloads remain
in the existing encrypted immutable versions rather than being copied into the group
receipt. The coordinator exposes no receipt/audit update or delete operation.
Production database roles and index provisioning remain integration responsibilities.

## Consistent group reads

`read(principal, [{store, id}, ...])` returns each requested record from one Mongo
snapshot in deterministic kind/ID order. It applies configured size/capability checks
and every existing record's own read permission using its stored scope. A missing
record is null; one unauthorized existing member rejects the entire read. A
concurrent group commit cannot make this response combine old and new revisions.

Separate individual reads and independently delivered projections do not promise
that same group snapshot. Outbox events are still delivered at least once, one at a
time; downstream projections can temporarily lag one another. Applications needing
a consistent cross-record response must use an appropriate snapshot read/service.
The existing membership port is refreshed per check but is not serialized with the
Mongo session, so atomic membership revocation is not certified here.

## Evidence and remaining scope

Thirty-five new cases run against disposable real local MongoDB. They verify
multiple strict record kinds, exact and competing retries, stale members,
single/group write races, guard denial/isolation, cross-scope denial and revocation,
mode preservation, registered capabilities, reconnect, receipt corruption and size/
configuration errors. Server validators reject each record/version/audit/outbox/
receipt stage and the final group receipt to prove full rollback on creation and
replacement. A deterministic concurrent commit verifies snapshot-consistent reads.
Group events also pass through the existing outbox and authenticated projections.

`evidence/transaction/` retains actual typecheck, full backend test and build output.
All 183 added foundation tests pass; full backend suite has 425 passes and the same
one pre-existing RFQ comparison failure. Backend lint/test:contracts scripts remain
absent. No production database, provider, notification, route or deployment is used.

Approved domain contracts/schemas/guards, real identity/resource adapters, API wiring,
OTP/card compatibility, external event/provider idempotency, migration/repair,
scheduling/operations, retention/key/DB-role provisioning and production deployment
certification remain pending. Full BRD, DEV-005/006/008 and R1/R2 are not complete.
