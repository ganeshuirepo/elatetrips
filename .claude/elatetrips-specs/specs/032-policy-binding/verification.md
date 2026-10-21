# 032 verification and handoff

Scope: `feature/032-policy-binding`, worktree `.worktrees/v10-policy-binding`. Changes are limited to this spec and `elatetrips-node/src/modules/policy/**`. Frozen policy/contracts remain unchanged. No foundation implementation, other module implementation, earlier spec or environment/provider files were read. No packages were installed; existing node_modules and MongoDB 8.2.6 tooling were used.

## API and trust boundary

`openPolicyBindingService({ foundation, acceptance, proposalClock })` opens the actual public `openPolicySnapshotStore` from `../foundation/policy-snapshot`. `foundation` is the documented `PolicySnapshotOptions` without `validateProducer`; the factory supplies its strict `createPolicyProducerValidator`. Foundation retains all encryption, authenticated durable envelopes/fingerprints, Mongo transactions, write-once records, receipt/idempotence, audit/outbox and fresh account/membership/booking/permission checks. No alternate persistence or encryption is added.

Returned methods:

- `accept(token, intent)` takes a transient bearer separately. Intent includes command/correlation/snapshot/event IDs, booking/tenant/context/quote/partner IDs, actor ID/actor/role, acceptance record/revision, RFQ/business/trip dates, exact policy ID/version, amount/currency and complete accepted resolution/estimation configuration.
- `read(token, bookingId)` performs a fresh authenticated foundation read and returns its frozen original result or authorized null.
- `estimate(token, bookingId, { cancellation_date, captured_amount })` freshly reads and validates the accepted persisted producer snapshot, then invokes the existing estimate-only engine with its original trip date/config/terms. Captured amount remains an input assertion, not verified ledger data.

Caller intent is strictly parsed, deeply detached and frozen before the first await. Callers cannot submit a catalog, producer body, timestamp, evidence or policy JSON to `accept`. The bearer never enters persisted/returned body, manifest, domain event, evidence or audit.

The mandatory `PolicyAcceptanceAuthority.load(acceptanceId, revision)` adapter supplies an authoritative accepted record with exact intent, catalog and evidence. It must load authenticated server-owned approval history, including the policy catalog actually accepted; caller JSON is not an adapter. The mandatory synchronous `verify(evidence, intent, snapshot)` must authenticate the complete intent and exact pure producer snapshot against a durable trusted source/signature and retained historical verification material. It must not merely compare a caller-provided hash or return true. This module deliberately implements no approval signer, consent capture, production ledger or live approval adapter. Fixture verification uses an independent in-memory issued-record register and exact evidence/intent/snapshot equality, not a SHA as consent. Trust in a production authority adapter remains explicit and external.

Both dependencies and the proposal clock are required at factory runtime. Missing/invalid foundation configuration disables opening; absent accepted records, intent mismatch, invalid provenance and policy/configuration failures prevent commit. Missing estimation configuration remains explicit unavailable in the pure estimator. Provenance verification runs for decrypted reads and replays too: a verifier refusing historical evidence disables those operations. It must never consult latest mutable catalog to validate an old accepted record. Foundation independently obtains authoritative booking scope/brand/module/tenant bindings via `resolveBooking`, verifies fresh account/role/permissions and checks exact metadata/policy/event mapping. Production deployments must supply real adapters and managed stable fingerprint/encryption keys; this feature does not install them.

## Saved request and race semantics

Internal service body format `policy-binding-v1` contains the exact original pure producer proposal, full stable caller intent and trusted acceptance evidence. Frozen canonical policy is unchanged. Strict extraction validates every body/proposal/snapshot/event field, event projection, advisory producer fingerprint, intent projection and trusted provenance; no unconditional validator exists. `validatePolicyProposal` validates persisted proposals without resolution, preparation, latest catalog or clock. Its existing SHA algorithm is only advisory producer integrity; authority verification establishes acceptance provenance.

The foundation command projects the canonical policy and IDs from that body. Its canonical domain `event.after` equals the COMPLETE service body, and required payload keys remain exactly booking_id/policy_id/version. This is an internal service envelope, not a global contract modification.

An already-saved retry first performs fresh read authorization, strictly compares the entire persisted caller intent, reconstructs the ORIGINAL command from validated saved data, then calls `store.commit(token, originalCommand)`. It never loads acceptance/catalog, reselects/reprepares policy or consults proposalClock. Commit therefore still requires fresh write permission and exact fresh actor matching. Read permission alone grants neither replay nor new consent/payment authority. Any changed manifest field conflicts.

Identical requests that both read empty may create different proposal timestamps. Foundation fingerprint checks remain strict. Only immutable/idempotence/revision conflict codes trigger a fresh authenticated winner read; full semantic caller intent must match before committing the original winner command. Changed accepted intent has one winner and one conflict. No unconditional returnExisting path or weakened foundation fingerprint is used. Different configuration is still rejected by foundation. Mapping drift/revocation prevents saved reads/replay.

## Event accounting

Each durable commit has TWO INTERNAL foundation audit records and TWO INTERNAL outbox entries: snapshot plus reference-only event reservation. The authoritative canonical domain event is the snapshot-kind foundation envelope's `after.request.event` (also returned as `result.event`). The service body retains the pure producer proposal and its event as evidence at `after.request.snapshot.body.proposal.event`; that nested proof is NOT an additional publishable event. The reservation marker is reference-only and is NOT a domain event. Exactly one canonical domain event is reserved. `result.receipt.eventId` is an internal audit ID; `result.event.event_id` is the domain event ID. No publisher, dispatcher, delivery, external API, payment/confirmed state or settlement is wired or claimed.

## Verification

All processes use the strict own-spec runner allowlisting OS environment keys and setting fixture secrets, disabled provider values, deliberately unusable inherited Mongo URI, MongoDB 8.2.6 system binary and downloads disabled. Integration creates its own ephemeral local replica set, random per-fixture storage keys and isolated databases, then closes client/server. No live DB/provider is contacted. Raw Mongo queries use only public client collection discovery/read APIs, never private foundation helpers.

Commands and final results:

1. `node .claude/elatetrips-specs/specs/032-policy-binding/checks.mjs src/modules/policy/policy.test.ts src/modules/policy/binding.integration.test.ts`: scoped lint green, contracts 15 schemas/20 fixtures green, build green, whole lint 256 TS files/0 errors/0 warnings. Initial focused fixture effective-range and tuple-typing issues were fixed.
2. `node .claude/elatetrips-specs/specs/032-policy-binding/focused.mjs --repair-checks`: final scoped lint and typecheck both exit 0 after the test-only fixes.
3. `node .claude/elatetrips-specs/specs/032-policy-binding/focused.mjs src/modules/policy/policy.test.ts src/modules/policy/binding.integration.test.ts`: final 99/99 tests pass, 0 skipped (24 new real-Mongo integrations + 75 existing policy regressions), 7.798 seconds reported test duration.

Evidence is in `evidence/summary.json`, final focused/scoped/typecheck logs, contracts/build logs and whole-lint.json. No full application/harness rerun or inherited verify:acceptance was executed. Cumulative application and harness review follows independently.

Integration proves encrypted raw Mongo does not expose sensitive policy ID, acceptance proof or bearer; two audit/outbox records per new acceptance; exact detached/frozen result and retry receipt; saved original terms after empty/current catalog changes with throwing loader/clock; eleven changed-intent conflicts; foreign scope, revoked account, foreign actor and read-only replay denial; mapping drift; simultaneous equal requests with distinct timestamps and catalogs of different lengths; different concurrent accepted intent; strict malformed/forged/changed body/event/projection rejection; pre-await input detachment; missing acceptance/config disabled; exact accepted provenance versus changed authoritative terms; reopening with original keys and changed adapter configuration rejection; and rollback of a second booking when the canonical event reservation collides (no partial snapshot/audit/outbox).

Production API/router/container, approval capture/authenticity adapter, verified financial ledger, keys/rotation operations, payment/refund settlement, delivery adapters and commercial rule approval remain external/unimplemented. Estimates are not refunds, paid bookings or provider cancellation guarantees. Commercial launch and R1/R2 acceptance remain outstanding. No deployment, push or main merge occurred.
