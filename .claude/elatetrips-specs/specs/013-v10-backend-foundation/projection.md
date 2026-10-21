# Replay-safe snapshot projection foundation

Implementation: `elatetrips-node/src/modules/foundation/projection.ts` and the
module-local authentication helper `foundation-event.ts`. This supplies a DEV-008
consumer primitive for the existing versioned producer/outbox. It mirrors an
authenticated source snapshot. It does not implement booking, financial or provider
state machines, and it does not create another authoritative RFQ/cart.

## Server boundary

`openSnapshotProjection` receives an explicit Mongo client/database/namespace,
projection ID, source kind/schema version, strict JSON-stable payload validator,
storage keys, server clock, read-permission action, current membership directory and
server policy loader. There are no policy, price, schema or secret defaults. Opening
requires a replica set or sharded deployment with logical sessions. Standalone Mongo
is rejected before derived collections are created.

`apply(eventId)` is a trusted internal server port. It reloads the immutable event
from the source audit collection, authenticates the encrypted body and validates its
ID/aggregate/revision. The configured kind and schema version must match. The
payload validator must preserve the canonical JSON exactly; a transformation or
silent field stripping is rejected. The source producer remains authoritative.

`handle(message)` is compatible with the explicit outbox handler. It uses only the
event ID to reload the source; callback payload and timestamps cannot become source
truth. No endpoint accepts these commands and no provider or scheduler is mounted.
Private snapshots stay within trusted server adapters.

## Revision and idempotency behavior

| Input | Result | Persistence |
| --- | --- | --- |
| First revision / next contiguous revision | `applied` | Snapshot, receipt and audit commit together |
| Same consumed ID and canonical intent | `duplicate` | No writes; original receipt time retained |
| Same consumed ID with changed intent | `EVENT_CONFLICT` | Rejected; no writes |
| Revision above the next expected revision | `gap` | No snapshot advance or receipt |
| Unconsumed authenticated older revision | `stale` | No writes or state regression |
| Changed scope / broken before snapshot | `SCOPE_CONFLICT` / `CHAIN_CONFLICT` | Rejected; no writes |

Before a contiguous update, the event's before snapshot must equal the existing
authenticated payload, and its scope must match exactly. Revision ordering drives
state progression; source timestamps never decide whether to overwrite state.
`handle` turns a gap into `REVISION_GAP`, allowing the outbox's configured retry
policy to defer it. Applied, duplicate and stale outcomes complete the handler.
Finite retry exhaustion still requires operational gap repair/replay.

Receipt fingerprints use a stable HMAC over the full canonical source event and
are scoped by projection/event ID. Separate projections can consume the same event
independently. Exact retries after a later revision or a client restart cannot
rewrite newer state or create another projection audit.

## Atomic storage and reads

Application uses snapshot read concern, primary reads and majority write concern in
one Mongo transaction. No external handler runs inside it.

| Collection suffix | Contents | Behavior |
| --- | --- | --- |
| `_projection_records` | Current encrypted derived snapshot and source metadata | Create / revision-checked replacement |
| `_projection_receipts` | Encrypted source-intent fingerprint, source time and first successful receive time | Insert only |
| `_projection_audit` | Encrypted projector/source actor, role, scope, schema, timestamps and before/after | Insert only |

Unique indexes protect projection/aggregate keys, projection/event receipts and
projection/aggregate/revision audit entries. Competing consumers retry database
conflicts and converge on one applied receipt. A server-rejected record, receipt
or audit insert rolls the entire projection transaction back. Source records and
their immutable events are not modified by the projection.

AES-256-GCM authenticated data binds each encrypted record/receipt/audit to its
database, namespace, projection, record type and metadata. The record binding
includes scope, source kind/schema, aggregate, revision and event ID. Missing keys,
altered ciphertext or metadata fail closed. Encryption key rotation retains read
keys; fingerprint-key migration remains an explicit operational action.

`read(principal, sourceId)` returns the current derived snapshot or null. It loads
scope from storage and checks fresh server policy/memberships using the existing
request-local verified principal before decrypting. Serialized principals,
unrelated memberships, revoked access and unavailable permission sources deny
reads. Authenticated-data validation prevents changed stored scope metadata from
releasing another scope's private snapshot. No tenant authority comes from the
projection callback or source event's actor claims.

Snapshot output retains `occurredAt` from the source event and `receivedAt` from
the projector's server clock when its first successful application begins. Driver
retries share that receive time; a duplicate does not replace it. These timestamps
describe source/application receipt separately and are not an external provider's
delivery-confirmation timestamps.

## Verification and remaining scope

Thirty-eight new cases run against disposable real local MongoDB. They exercise
duplicate and adjacent consumers, multi-revision gaps, changed intent/chain/scope,
fresh authorization, encrypted integrity, key retention, client restart and unique
indexes. Server validators force insert/update failures to prove rollback.

Two integration scenarios join producer → outbox → projection: an acknowledgment
failure after projection commit triggers a second delivery with one durable
projection change; an out-of-order delivery retries and applies after the missing
event. Callback-body injection cannot change the authenticated snapshot.

`evidence/projection/` retains the full checks: typecheck/build pass; 390 backend
tests pass and the same one pre-existing RFQ comparison test fails. All 148 added
foundation tests pass. Backend lint/test:contracts scripts remain absent. Full BRD,
DEV-005/006/008 and R1/R2 are not declared complete.

Approved domain schemas/reducers, external event ingestion/signature verification,
provider idempotency, real identity/resource adapters, API routing, worker scheduling,
migration/backfill/repair, retention, least-privilege database/index provisioning and
production transaction/time/failover checks remain required. This local mirror is
not certification of commercial confirmations or financial side effects.
