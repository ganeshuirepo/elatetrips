# Scoped delivery history (DEV-008 technical slice)

`delivery-history.ts` supplies an explicit read-only history port for one known
foundation source event. It has no HTTP route, dashboard, scheduler, retry, repair
or provider capability. Frozen shared contracts remain unchanged. The two new
module-local actions, `delivery.history.read` and `delivery.history.details`, have
no default grants; production adapters and permissions still require integration.

Construction requires a client, database/namespace, storage keys, clock, current
membership directory, permission loader and versioned history policy. The policy
contains `policyId`, `revision` and positive `maxPageSize`; no operational page
size is supplied by the engine. The technical upper bound leaves room for the
extra row used to detect duplicate versions within MongoDB's signed cursor limit.
Standalone deployments are rejected. Opening the port checks transaction support
but creates no collections or indexes. Worker/recovery provisioning retains
ownership of the event/version journal index.

`read(principal, { eventId, limit, includeDetails, cursor? })` accepts only those
fields. It authenticates the encrypted immutable source, derives the exact scope
from that event, then requires current `delivery.history.read` permission before
reading queue or journal contents. Detailed output additionally requires current
`delivery.history.details` permission. Every continuation repeats source
authentication and fresh permission/membership checks. A token alone, a browser
role, an unrelated organization/partner/customer membership, or an ungranted admin
role cannot authorize the request. Directory and storage errors use fixed codes.

Basic entries contain version, timestamp, transition reason and before/after
delivery state, counters, timing and fixed failure codes. They omit business
payloads, lease tokens, worker IDs, actor IDs, membership IDs, policy identities,
operator reason codes and raw exceptions. Detailed entries explicitly add actor,
role, policy identity/revision, operator membership/reason code and renewal-policy
identity/revision as applicable. Even detailed output omits tokens and business
content. Cursor encryption also hides its internal anchor worker IDs.

## Pagination and checked integrity

The first Mongo snapshot reads the source, current queue and latest journal anchor
together. That queue version becomes the immutable watermark for this traversal.
Each page reads at most the requested row count plus one duplicate-detection row;
anchor queries are separately bounded. Page entries must have strictly contiguous
versions, matching event IDs, valid strict format-2 snapshots and exact before/after
links. Worker claims/reclaims, success/failure, exhaustion, invalid-event quarantine,
lease renewal and operator retry must each have their expected structural field
changes. Version-zero state must match the authenticated source's initial pending
snapshot. Current queue state must equal its latest journal after-snapshot; journal
versions beyond the current queue or at/below zero reject the read.

Continuation is an AES-GCM envelope bound to database, namespace and cursor format.
Its strict encrypted body binds user, event, complete read policy, detail mode,
authenticated source fingerprint, initial watermark snapshot and previous page's
ending snapshot. It cannot be moved across users/events or changed policies/detail
modes. Page size can change within the configured bound. Retained encryption read
keys permit continuation after key rotation; removing a required key makes the
cursor unusable. There is no implicit expiry policy; authorization is rechecked on
every use.

Later pages verify their saved prior-page and watermark anchors, and also verify
the then-current queue/latest-row anchor in a new snapshot. They refuse rollback
below the captured watermark. Later valid deliveries can advance the current queue
without entering this traversal. The final page must end at the original captured
watermark snapshot. A fresh traversal observes the newer queue version.

These are **structural checks of the returned rows and explicit anchors**, not a
claim of cryptographic authenticity for the plaintext delivery journal. They do not
scan every unseen older row, authenticate an operator's plaintext identity against
the historical membership store, validate unseen transition policy settings, or
detect a privileged writer's coherent rewrite of plaintext history before it is
captured. Cursor AEAD protects captured continuation anchors; source-event AEAD
authenticates source content and scope. Those protections do not make the delivery
journal cryptographically signed. Production append-only database roles, retention,
backup and independent integrity controls remain pending.

A missing event and queue returns `null`; an orphaned queue fails `EVENT_INVALID`.
An authenticated source with a missing/corrupt queue, missing/gapped/duplicate page
row, broken linkage or inconsistent anchor fails `INTEGRITY_FAILURE`. A corrupt
source cannot be bypassed even by ops. Invalid/mismatched continuations fail
`INVALID_CURSOR`. This port performs no mutation, read audit, requeue or repair.

## Verification

The focused suite has 42 real-Mongo cases. It covers full producer → failed
delivery → operator retry → renewal → success replay across pages, concurrent
worker commits during a snapshot read, later-transition watermark stability,
scheduled retries, reclaimed/expired leases, restored-source quarantine history,
permission revocation and scope isolation, metadata privacy, cursor binding and
source intent, corrupted/missing journal/queue/anchors, strict requests/policy,
reconnect/key rotation, standalone rejection and no writes/index creation.
Integration assertions run outside worker consumer callbacks so assertion failures
cannot be swallowed as ordinary delivery failures.

Retained focused/typecheck/build logs and summary are in
`evidence/delivery-history/`. Aggregate full-suite results are in
[sequential-verification.md](sequential-verification.md) and `evidence/sequential/`.
Production route/permission/policy wiring,
real account/resource directories, approved contracts and the remaining
DEV-005/006/008 acceptance remain incomplete.
