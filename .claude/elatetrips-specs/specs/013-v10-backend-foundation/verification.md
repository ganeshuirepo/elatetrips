# Verification - 21 October 2026

| Check                              | Baseline         | Sequential aggregate verification |
| ---------------------------------- | ---------------- | --------------------------------- |
| Typecheck                          | Pass             | Pass                              |
| Full Node test suite               | 242 pass, 1 fail | 608 pass, same 1 fail             |
| Build                              | Pass             | Pass                              |
| New JWT/identity tests             | Not present      | 44 pass                           |
| New persistence/crypto tests       | Not present      | 36 pass                           |
| New outbox tests                   | Not present      | 30 pass                           |
| New projection tests               | Not present      | 38 pass                           |
| New multi-record transaction tests | Not present      | 35 pass                           |
| New recovery tests                 | Not present      | 37 pass                           |
| New runner tests                   | Not present      | 25 pass                           |
| New lease-renewal tests            | Not present      | 20 pass                           |
| New managed-consumer tests         | Not present      | 31 pass                           |
| New delivery-history tests         | Not present      | 42 pass                           |
| New delivery-runtime tests         | Not present      | 28 pass                           |

The existing failure is the RFQ supplier-name/price comparison in rfqflow.test.ts. No owning RFQ module source was inspected or modified. JWT regression tests reproduced nine missing boundary rejections before hardening; all 14 credential cases pass afterward. Thirty new local identity/scope cases also pass.

Logs and actual commands are retained in evidence/baseline, evidence/final (identity)
and evidence/persistence, evidence/outbox, evidence/projection, evidence/transaction
and evidence/recovery, evidence/runner, evidence/renewal. Focused handoff evidence is
in evidence/managed-consumer, evidence/delivery-history and evidence/delivery-runtime.
The latest complete typecheck/test/build logs and commands are in evidence/sequential.
Original .env and deployment files were not
copied/read; tests use fixture signing/admin keys, inert provider credentials and a
disabled production database URI. The new suite launches disposable local MongoDB
processes for actual transaction/index/CAS tests. It does not establish production
deployment capability or real account/membership integration.

The backend package provides neither lint nor test:contracts; no passing result for those scripts is invented. Canonical contract replay is separately verified in the experiences worktree. New API/shared entity adoption and real membership/persistence adapters remain pending.

No HTTP endpoint, application database connection, supplier operation, outbound
notification or deployment is enabled by this slice. Database writes occur in real
disposable test databases. The existing JWT adapter retains the phone credential
shape and 401 error boundary. Permission configuration defaults to deny all.

The 34 MongoDB scenarios prove atomic rollback when audit/outbox/receipt insertion
is rejected by server validators, immutable history, snapshot-consistent history
during a concurrent commit, unique indexes, competing expected revisions, identical
parallel retries, changed retry rejection, fresh-client read/replay, exact scope and
revocation denials, stored-mode protection, unavailable clients, schema/decoder
failures, key rotation and corruption rejection. Two additional crypto/JSON tests
cover canonical JSON, lossy JSON rejection and record-bound encryption.

Thirty outbox cases add actual Mongo lease claims/recovery, concurrent workers,
version/token fencing including reused worker IDs, configurable retries and exhaustion,
versioned policy changes, distinct source/receive times and authenticated event
quarantine. Real collection validators prove rollback if claim/completion/retry/
quarantine audits or queue replacements fail. Lost-client recovery demonstrates
at-least-once handling with the same event ID; it does not establish an idempotent
business consumer or provider. The worker has no background loop or external adapter.

Thirty-eight projection cases establish a replay-safe local mirror with an encrypted
consumer receipt and append-only audit in the same transaction as its derived state.
They cover simultaneous consumers, contiguous/gap/stale revisions, source intent,
before/after chain, scope and encrypted metadata integrity, current authorization,
restart, key retention and unique indexes. Real server validators reject record,
receipt and audit inserts to prove creation/update rollback. Producer/outbox/projection
integration tests recover from lost acknowledgment without a second projection change
and recover a deferred out-of-order event after its missing predecessor. Callback
payloads are reloaded from authenticated source events. Domain/provider state machine
acceptance remains pending; this is an unmounted technical mirror.

Thirty-five multi-record cases use the shared individual-store staging/commit path
to prove atomic groups across two strict record kinds, immutable group results,
competing commands, stale members, single/group races, configured guard enforcement,
scope denials/revocation and encrypted group-receipt integrity. Server validators
reject each stage and the final group receipt after per-record changes to prove
complete rollback. A concurrent commit between group reads still yields one database
snapshot. Reopened stores/coordinator retain exact replay, and group events remain
compatible with the outbox/projection protocol. Actual domain invariants and APIs
remain pending; the fixtures contain no production business policy.

Thirty-seven recovery cases add fresh scoped delivery.read/delivery.retry permissions,
payload-free metadata inspection, explicit enabled/budget/reason policy, expected
versions, exact encrypted command replay and monotonic lifetime/recovery counters.
They verify concurrent operators, active and stale workers, permission revocation,
source/receipt/format/counter integrity and real-server rollback at queue, journal
and receipt writes. Producer/outbox/projection recovery after a committed consumer
effect creates no second projection change. The complete suite also verifies the
existing worker/transaction/projection paths with queue format 2. No production
policy, operator route, source repair operation or provider is enabled.

Twenty-five runner cases cover explicitly enabled construction/run, exact kind/schema
routes, unknown-event exhaustion, configured pacing, finite/reset infrastructure
retries, timer cancellation, concurrent/repeated-start rejection and typed failure
redaction. Eight of them use real Mongo to verify shutdown during claim/consumer,
cooperative cancellation, restart with pending work, lease loss and producer/runner/
projection replay after a committed effect without duplicate projection changes.
The runner is unmounted and adds no forced consumer termination or production
provider/supervisor. It now forwards the optional renewal control below.

Twenty lease-renewal cases prove explicitly configured count/lifetime caps, no-op
renewals, exact-expiry/same-worker replacement fencing, concurrent/unawaited request
draining, closed controls and acknowledgment/failure after renewal. Real server
validators prove queue/audit rollback and prevent acknowledgment even after a caught
or ignored renewal failure. Invalid clocks/configuration/queue metadata fail closed;
runner routes receive the private control. Renewal remains disabled without explicit
policy; the worker itself starts no heartbeat.

Thirty-one managed-consumer cases cover sequential heartbeats, cooperative deadlines,
first-failure preservation and draining consumer/renewal work before acknowledgment.
They include five real-Mongo cases for renewal fencing, deadline retry and audit
rollback. Forty-two real-Mongo delivery-history cases cover fresh scoped permissions,
separate detailed access, payload/token privacy, immutable traversal watermarks,
encrypted cursor binding, bounded contiguous pages, anchor integrity, concurrent
worker commits and no writes/index creation. Plaintext journal checks remain
structural, with no claim of historical cryptographic authenticity.

Twenty-eight runtime cases cover compatible explicit policy bounds, detached keys,
routes and arrays, disabled/pre-aborted laziness, fresh initialization after failed
openings, finite storage retries and shared-client ownership. Six real-Mongo cases
exercise producer/managed renewal/projection/acknowledgment and cancellation/deadline
cleanup. All 366 added foundation tests pass in the 609-test aggregate suite (608
pass, one baseline RFQ failure, zero skipped). No automatic application mounting is
introduced; heartbeats require an explicitly invoked configured managed wrapper.

The final sequential reviewer found no concrete implementation defect requiring a
source correction. Review covered cancellation/cleanup races, renewal acknowledgment
fencing, scoped cursor privacy/anchors and lazy initialization/configuration copies.
See sequential-verification.md for handoffs, actual exits and remaining dependencies.

Full DoD remains unmet because the original RFQ failure persists and the backend
does not define lint/test:contracts scripts. See persistence.md for remaining scope.
