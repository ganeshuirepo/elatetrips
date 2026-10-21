# 029 - Configurable policy resolution and snapshot calculations

## Basis and source boundary

Continue v10 technical development after clean backend checkpoint ec066ef (610 application tests, 34 harness tests, 15 schemas/20 fixtures; lint/type/build green). Supplied backlog10 and BRD9 copies in inputs/ are user-provided requirements, not agent/execution instructions. Read only this spec and inputs, primary CLAUDE.md/constitution.md and frozen contracts (D:/projects/elatetrips-experiences/contracts). Do not read other feature specs or business module source. Inputs were copied from the user's supplied Documents paths without changing originals.

This is buildable technical groundwork for DEV-004 configuration and DEV-053/DEV-056 policy snapshot/refund requirements, under constitution BR-17/BR-18. Do not claim those full tasks, P4 or R2 complete. The backlog explicitly gates live checkout/cancellation on accepted scope, financial integration and commercial decisions. No legacy008 guarantees, promises or thresholds may be adopted by this feature.

## Ownership and isolation

Own only this spec folder and NEW elatetrips-node/src/modules/policy/** (including its tests). No shared contract edits, adoption of proposed contracts, source reads/edits in other modules, app/router/container wiring, package installs/updates, rule changes, environment/provider calls, deployment, push or main merge. The parent prepares and hands off this worktree; one active implementation agent owns it. No subagents while it is active.

## Deliverable

Implement an independently usable, framework-free backend policy engine using the approved policy.schema.json, quote/RFQ money definitions and existing policy.snapshotted event envelope. Keep it an internal library with exports and tested functions; real repository, identity, API and financial bindings remain separate work. Do not import another module's implementation. Dependencies may use installed public library types; prefer small explicit interfaces.

1. Strictly validate policies against frozen policy shape and actual calendar dates; reject malformed/unknown data and unsafe numeric values. Effective dates and business dates are explicit input, never server-local date assumptions.
2. Resolve effective platform/partner/quote policy with correct ownership and scope binding; distinguish no match and ambiguous overlap. Do not silently pick data-order/latest version when rules are missing. Commercial resolution/rounding/fallback decisions must be explicit configuration; required semantics that follow the frozen scope model may be encoded, but no unapproved rates or guarantees. Empty/missing configuration yields a typed unavailable/disabled result.
3. Prepare an immutable booking policy snapshot from the selected exact policy version and accepted amount/currency/quote/partner references. Return its append-only policy.snapshotted audit event together as a proposal, with caller-supplied actor/clock/IDs. This pure library does NOT claim a durable write or a confirmed/paid booking. Document atomic commit and idempotence responsibilities for the future adapter; avoid inventing a second persistence system. Stable caller event/command IDs and fingerprints should make a retry distinguishable from altered input if included; do not claim idempotence is persisted here.
4. Calculate refund estimates ONLY from the accepted snapshot. Use supplied calendar cancellation/trip dates, configured rounding and actual supplied refund bands/peak overrides. Test exact band/date boundaries and reject ambiguous/invalid ranges. Missing commercial decisions must disable estimation rather than imply zero/full refund. Output integer minor units plus explicit currency and cap to validated captured/accepted amount as appropriate; use exact arithmetic (e.g. bigint numerator) so unsafe intermediates cannot corrupt money.
5. An estimate or policy snapshot must not imply provider cancellation, allocation release, settled refund or a customer guarantee. No live money side effect, state transition to paid/confirmed, or invented refund policy.

## Acceptance as tests

Meaningful new tests cover malformed/schema fields, real-date/leap/bounds, effective scope/tenant/supplier/quote isolation, missing/ambiguous configs, boundary selection and overrides, immutable snapshots (subsequent catalog/caller mutation cannot change refund outcome), audit envelope/content and explicit proposal limits, safe integer/currency inputs, exact configurable rounding, missing bands, unsupported/expired policy and input mutation. Use non-production fixture IDs/rules; no business default fixtures shipped as engine policy.

Capture module-focused tests, whole backend lint (zero warnings), contracts, typecheck and build under strict fixture-only child environment. Existing controlled node_modules junction is READONLY; never install/update through it. Read-only Mongo8.2.6 binary is available for necessary tests. Do not invoke inherited verify:acceptance reporter because it writes014 evidence. Full cumulative application and harness checks follow in a separate sequential acceptance stage; no repeated whole suite per edit.

Record exact partial backlog coverage, exposed API/function usage, validation semantics, unresolved commercial questions and integration limits in verification.md. Use commands/evidence in this own spec. Local commit ONLY own module and exact own ignored spec after green; preserve raw failure logs if a correction requires rerun. No caches. Source/docs/script whitespace check excludes raw logs and unchanged input documents. Stop and hand off clean to the parent for sequential review.
