# 034 Policy durability acceptance

Final independent policy binding review passed at source checkpoint `bc3abd064716430d53a2513de334552a03680b03` plus the retained owned regression patch. Branch: `feature/034-policy-durability-acceptance`. The policy module contains 7 tracked TypeScript files and 1,293 lines, including tests. No concrete runtime defect was found in the owned producer/binding. The only source change adds 27 lines to `binding.integration.test.ts`.

The new integration test exercises the corrected public behavior from 033 through the real policy producer, binding and foundation Mongo store: a different eligible actor in the same authoritative organization/booking scope can reopen the service, read the identical durable snapshot and estimate a 7,500-minor-unit fixture refund from the original terms. The stored writer actor/role remains unchanged. Original-writer replay is denied for the other actor, changing the claimed actor conflicts, and no persisted rows change. Accepted-record reload and proposal clock access are forbidden during those operations. Removing read permission or changing scope denies access. These amounts and rules are fixture data only.

## Final verification

Executed the owned `checks.mjs` exactly once after the source change. Every required command exited 0. No suite or build was repeated after green; subsequent work only produced documentation, metadata and the local commit.

| Check | Result |
| --- | --- |
| `npm run test:contracts` | 15 schemas and 20 fixtures |
| `npm run typecheck` | Exit 0 |
| `npm run test` | 754 tests, 46 suites, 754 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo |
| `npm run test:harness` | 34 tests, 0 suites, 34 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo |
| `npm run build` | Exit 0 |
| Whole backend ESLint, `--max-warnings 0` | 256 files, 0 errors, 0 warnings |

Raw results are retained in `evidence/*.log`; `evidence/whole-lint.json` contains counts and diagnostics without embedded source. `evidence/summary.json` records exact counts, source hashes, checkpoint, source-diff digest, capabilities and remaining work. `evidence/owned-source.patch` contains the tested source delta. `audit.mjs` and `summarize.mjs` inspect owned files, result logs and Git metadata only; they do not rerun application checks.

The runner constructs child environments from an explicit OS-variable allowlist and fixed nonproduction fixture values. Runtime Mongo downloads are disabled; the existing Mongo binary and node_modules are used read only. Tests use a local temporary Mongo replica set. No inherited `verify:acceptance`, real provider credentials, production environment files, package installs or cache artifacts were included in the commit.

## Reviewed capability and boundaries

The owned pure engine validates canonical policy shape, safe integer money and calendar dates; configurable scope/effectivity, fallback and ambiguity; exact accepted policy ID/version; fixed contract percentages over 100; configured rounding, peak boundaries and accepted/captured bases; captured-money caps; immutable JSON snapshots and advisory proposal fingerprints. Commercial rules remain supplied data/configuration, with missing rules disabled or rejected.

The binding validates complete caller semantics, canonical projection/body/event agreement and exact trusted accepted-record provenance over the intent and producer snapshot. It detaches caller input before the first await. Trusted acceptance loader/verifier and proposal clock dependencies are mandatory. Foundation authorization, booking/context/tenant/quote/partner binding, required configuration and encryption/receipt handling remain delegated through the public store API. Caller JSON alone establishes no customer consent. Tenant equality and authoritative identity/resource scope are distinct responsibilities; organization or brand eligibility must be supplied by the trusted identity and booking adapters.

Saved retries use the authenticated stored proposal and original accepted terms, without loading the latest catalog, creating a new proposal or consulting its clock. Changed semantic intent conflicts. Concurrent equivalent requests with different proposal timestamps reconcile only to a matching stored winner; foundation proposal conflict checks remain strict. Reads and estimates use the independent validated persisted snapshot. Owned integration tests cover provenance forgery, malformed/mismapped proposal bodies/events, nested-field mutation, revoked/foreign scope, authoritative mapping/configuration drift, asynchronous caller mutation, initial denial before acceptance load, reservation collision rollback and no partial writes.

The full application run also exercises the inherited foundation persistence, transaction, snapshot and integrity tests. No foundation implementation or earlier spec contents were manually read. The supplied 033 checkpoint preserves legacy opt-in defaults and legitimate outbox lease/ack operations while authenticating immutable snapshot/audit/receipt linkage; it permits eligible different readers while preserving the original stored writer and strict commit/replay identity. This report does not infer cryptographic authentication of arbitrary mutable outbox bookkeeping.

There are two internal audit/outbox rows per first commit: the policy snapshot and event reservation/claim. The authoritative canonical `policy.snapshotted` payload is the authenticated foundation audit record with kind `policy-snapshot`, at `after.request.event`. The nested producer event is validation proof, not a second dispatch. Exact retry adds no event. No domain publisher/dispatcher is wired by this work.

## Ownership and remaining integration

Git metadata auditing covers all three prior commits from `scopes.json`: 031 `440542e97a7e0a4f0b63a477bef115760e8f7b5b`, 032 `d9c4099620db09f27b8e708b5d7234c4c0f00717`, and 033 `bc3abd064716430d53a2513de334552a03680b03`. Every prior path belongs to its declared spec/module. Current paths are limited to this spec and policy source; ownership violations are zero. Source diff and owned root documentation/script whitespace checks pass; raw logs and input snapshots are excluded from whitespace checks. Detailed paths and hashes are in `evidence/path-audit.json`.

This proves configured Mongo-seam durability and policy integration under fixture trusted ports. Production still requires accepted-cart/proposal and consent-evidence adapters; real identity/membership/permission and authoritative booking resolvers; managed database/key lifecycle; service/container/router wiring; domain dispatch and downstream replay-safe consumers; and approved commercial configuration.

Verified capture/ledger amounts, checkout revalidation, supplier mutation, provider cancellation, inventory release and settled refunds remain separate production integrations. The captured amount accepted by the estimator is input, not verified ledger evidence. No live paid booking, refund guarantee, settlement, production consent or authorization provider readiness is claimed. This acceptance does not complete DEV-006, DEV-008, DEV-053, DEV-056, the full BRD or human Gates R1/R2. Commercial responsibilities, certified supported supplier capabilities and those gates remain release prerequisites. No frozen contracts, packages, rules, providers, routes, deployments, pushes or main merges were changed.
