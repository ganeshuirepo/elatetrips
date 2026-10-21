# 033 policy persistence review

Reviewed baseline `d9c4099620db09f27b8e708b5d7234c4c0f00717` on `feature/033-policy-persistence-review`. Scope: this spec, foundation persistence/snapshot APIs and their foundation callers/tests, primary CLAUDE.md/constitution.md and frozen policy/event contracts. No other module implementation or earlier spec was read.

## Findings corrected

1. Opt-in integrity reads/replays ignored the outbox. Deleting a queue entry, changing its event ID, or introducing an invalid lease state still returned an accepted policy. `verified()` now requires a structurally valid queue entry linked to the immutable authenticated audit event and revision. Delivery state is intentionally mutable: a real outbox worker regression exercises reads and exact replays while each entry is leased and after each acknowledgement. No comparison to initial pending bytes or invented signature over mutable delivery fields is added.
2. `history()` bypassed `verifyIntegrity` by decoding revisions directly. It now verifies the current row and each historical revision in the existing snapshot transaction. A missing older audit is rejected with opt-in integrity; the same regression explicitly preserves legacy behavior with integrity disabled.
3. Policy reads compared current booking bindings including reader-specific event actor/role with the original writer's binding. An independently authorized same-scope staff reader could be denied. Reads now require fresh read authorization and exact authoritative booking/quote/partner/tenant/context/scope agreement. Stored event actor/role remains checked against the immutable stored binding. A different reader receives the original event and actor unchanged; replay still requires the original actor and current write authorization. Changed tenant binding and revoked membership are rejected.

## Validation

Seven new test cases were added. Before source changes, the policy suite had four expected regression failures (same-scope reader and three outbox corruptions); the real lease/ack compatibility case passed. The persistence suite had one expected regression failure for historical audit deletion; the disabled-integrity legacy case passed. Raw logs are retained as `regressions-red.log` and `history-regression-red.log`.

Final command:

```text
node .claude/elatetrips-specs/specs/033-policy-persistence-review/checks.mjs src/modules/foundation/policy-snapshot.test.ts src/modules/foundation/persistence.test.ts src/modules/foundation/transaction.test.ts
```

- 115 tests passed, zero failures/skips/cancellations, across the three targeted files (four suites): 108 existing + seven new.
- Scoped foundation lint: zero warnings/errors.
- Whole backend lint: 256 files, zero warnings/errors, exit 0.
- Contract checks: 15 schemas and 20 fixtures passed, exit 0.
- Typecheck and build: exit 0.
- `node --check` for the review runner and source/docs/script whitespace checks passed.
- The initial full runner caught a new test's string `_id` filter typed against the default Mongo ObjectId collection. The fixture now selects its revision instead; `initial-typecheck.log` preserves that corrected validation failure.

The runner uses fixture-only environment variables, local Mongo replica-set tooling with runtime downloads disabled, and no provider credentials. Its optional `--tests-only` mode captures focused red evidence without repeating broader checks. The runner also treats whole-lint exit status as mandatory.

## Semantic review and limits

The snapshot request is synchronously JSON-detached and frozen before the first await. Current account, exact membership, permission, authoritative booking binding and original write actor are checked for commits/replays. The complete request, configuration, permissions, binding and transaction intents participate in durable replay fingerprints. The write-once booking record, event-ID reservation, encrypted audits, two internal outbox entries, subreceipts and encrypted group receipt are committed in one transaction; cross-booking command/event reuse conflicts. The existing targeted tests cover concurrent commits, insertion rollback, copy isolation, encryption and persisted record/revision/audit/subreceipt/group-receipt tampering. Exactly one internal audit contains the canonical nested `policy.snapshotted` event; the other is a reference-only reservation. No additional domain event name or policy default was introduced.

The foundation schema enforces the frozen policy core, identifiers, dates and 0..100 percentage representation. Opaque producer body, currency/amount semantics, acceptance provenance and exact body metadata projection remain the mandatory trusted pure producer validator's responsibility. Booking/brand/module/tenant provenance remains an authoritative resolver responsibility; fresh identity and permission checks do not prove consent, booking settlement or production authorization. Directory revocation is refreshed but is not serialized with writes. Existing persistent-store commits all create queue entries; projections use their own persistence path and are not subjected to this opt-in store check. Arbitrary structurally valid mutable queue edits are not cryptographically authenticated. Immutable payload/audit/group receipt integrity relies on protected server keys and database operational controls.

Public interfaces and disabled-integrity defaults are unchanged. Opt-in history now fails closed for missing/corrupt supporting evidence, and authorized same-scope reads no longer bind to the writer's actor role. No router/container/package/contracts/global rules/provider/environment changes, installs, live database operations, deploy, push or main merge occurred.

The whole application suite, cumulative acceptance harness and real producer-to-store public mapping are deliberately deferred to reviewer 034. This review used fixture producers and the actual foundation store/Mongo; it does not claim to have rerun or manually inspected policy-module integration. No further concrete blocking defect was found in the reviewed scope. Handoff is committed and stopped after the owned path audit.
