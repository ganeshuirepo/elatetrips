# DEV-006 local persistence adapter

Implementation: `elatetrips-node/src/modules/foundation/persistence.ts` and
`encrypted-json.ts`. This is a technical adapter inside feature 013. It does not
adopt proposed shared domain schemas, mount HTTP endpoints or migrate legacy data.

## Operation boundary

`openVersionedStore` receives an explicit Mongo client/database/namespace, record
kind and schema version, strict JSON-stable Zod validator, mutable/append-only mode,
read/write permission actions, server policy loader, current membership directory,
clock and encryption keys. There are no global database connections or secret/key
defaults. Standalone MongoDB is rejected before collection creation. Transactions
require a replica set or a sharded deployment with logical sessions.

Callers resolve a fresh principal through `resolvePrincipal` for every request.
For creation, `createScope` must come from a server ownership resolver; it must not
be copied from request JSON. For existing records the adapter loads scope from the
stored aggregate and refuses ownership changes. Each read, history request, write
and retry replay rechecks server policy and current exact-scoped memberships.
The directory currently has no session parameter: concurrent membership revocation
is not serialized with the aggregate transaction. Production integration must
define that behavior rather than claiming this port proves it.

`write(principal, command)` validates/normalizes JSON and uses a Mongo transaction
with snapshot read concern, primary reads and majority write concern. It either
commits all five changes below or aborts them all. It returns a revision, event ID
and decoded payload. Updates require the expected current revision. An append-only
record cannot be replaced; its mode is persisted and authenticated, so reopening
the store with a mutable configuration cannot unlock it.

| Collection suffix | Contents | Write behavior |
| --- | --- | --- |
| `_records` | Current encrypted payload, revision, scope, schema version, mode, event ID | Create or compare-and-replace |
| `_revisions` | Encrypted snapshot of each revision | Insert only |
| `_audit` | Encrypted event with actor, role, membership, scope, time, command/correlation IDs and before/after | Insert only |
| `_outbox` | Versioned delivery metadata and event reference; no business payload | Producer inserts pending; explicit worker manages audited leases/completion |
| `_receipts` | Keyed input fingerprint and original result revision | Insert only |

Record IDs are hashed with their kind. Command IDs are namespaced by aggregate;
the same command on a different aggregate is independent. Identical retries return
their original immutable revision, including after a later update or a fresh client
connection. Reusing a command ID with changed actor/scope/input rejects. Revoked
membership cannot replay a receipt. Unique indexes protect aggregate revisions,
audit revisions and outbox event references; Mongo `_id` indexes protect commands
and current aggregate keys. A duplicate-key race gets one fresh transaction to
resolve the winning receipt/revision; driver-managed transient transaction retries
remain the Mongo driver's responsibility. No provider call occurs inside a retry.

`read` returns the current authorized record or null. `history` uses one database
snapshot so a concurrent commit cannot create a false integrity error. It checks
current ownership authentication, continuous revisions, matching scopes and the
latest event reference before releasing decoded history. The adapter exposes no
delete, revision replacement or audit update operation. Production database roles
must enforce collection privileges separately; this API cannot constrain an
administrator's direct database access.

## Storage protection and error behavior

Payloads and full audit bodies use AES-256-GCM with a fresh nonce for each seal.
Additional authenticated data binds a payload to database, namespace, kind, scope,
schema version, mode, aggregate, revision and event ID. Audit bodies bind database,
namespace, aggregate, revision and event ID. IDs/scope metadata remain queryable;
contact/business content is encrypted. Receipt fingerprints use a separate injected
HMAC key. Key buffers are copied when the store opens. Encryption key rotation
retains old read keys; rotating the fingerprint key requires a receipt migration.
No retention duration, key material or financial rule is hard-coded.

Malformed commands/payloads, unsafe revision numbers, non-stable decoders, missing
policy/membership data, stale revisions, changed retries, unknown schema versions,
mode mismatch, missing decryption keys and authenticated-data tampering fail through
fixed `FoundationStoreError.code` values. Driver messages and payloads do not become
HTTP error messages. Route adapters still need to map these codes to approved API
errors after the owner adopts the shared contracts.

## Verified limits

The acceptance suite starts real disposable local MongoDB processes: a one-node
WiredTiger replica set and a standalone instance for the unsupported-deployment
case. Server collection validators force audit/outbox/receipt insert failures to
prove rollback on creation and replacement. Other cases exercise races, indexes,
client close/reopen, scope/revocation, immutable history, decoder stability, key
rotation and corruption. Test payloads and membership ports are synthetic fixtures.
No production environment, provider or database is used.

The individual store supports single-aggregate writes. A coordinator now uses its
same staging/commit path for atomic multi-record writes and consistent group reads;
see [transaction.md](transaction.md). These mechanisms do not implement approved
business records, inventory/financial domain transaction guards, transition rules,
legacy migrations, production delivery adapters/scheduling, retention, production
key provisioning or production failover certification. An explicit recoverable
technical worker is now implemented; see [outbox.md](outbox.md). Its handlers and
replay-safe business projections remain required before DEV-006/008 is complete.
