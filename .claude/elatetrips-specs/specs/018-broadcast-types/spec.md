# 018 - broadcast typing and lint baseline

Continue v10 DEV-057 acceptance maintenance with sequential agents. Base is previous committed module checkpoint; cumulative application tests pass.

## Ownership

Own this spec folder and elatetrips-node/src/modules/broadcast/** only. Read primary CLAUDE.md and constitution.md first. Shared frozen contracts may be read. Never manually read another module source, earlier specs or original environment. Public imported types and compiler diagnostics may guide types without opening imported source. No contract, package, lint configuration or policy edits.

## Acceptance

- Remove 1 errors and 0 warnings with narrow behavior-preserving types or obsolete directive removal.
- No any, non-null assertions, suppressions or unsafe replacement casts. Preserve API results, database behavior, economics/configuration and method receiver binding.
- Scoped lint zero warnings, existing focused module tests, typecheck, frozen contracts and build pass. Add tests only for substantive behavior changes. One final post-change check run is sufficient; do not repeat whole tests per module.
- Run own checks.mjs for strict fixture-only environment, sanitized whole-lint counts and retained evidence. Do not run inherited verify:acceptance (writes014 evidence).
- node_modules junction is READONLY; never install/update through it. No live database, provider, environment or deployment operations.
- Local commit only owned paths after checks; clean stopped handoff. Whole cumulative tests follow all module fixes. BRD/R1/R2 are not complete merely because these checks pass.

## Verification (2026-10-21)

- Removed the unused `Route` type-only import from `broadcast.ports.ts`; emitted JavaScript, API results, configuration and audit behavior are unchanged.
- Ran this folder's `checks.mjs` once after the source change with its strict fixture-only child environment. Scoped lint, contracts, typecheck and build all exited 0. Contracts validated 15 schemas and 20 fixtures.
- No broadcast module `.test.ts` files exist. The runner detects this and records focused tests as **not applicable**, with `passed: null`; no zero-test result is represented as a pass. The final cumulative application suite remains required.
- Sanitized whole-application lint capture: 247 files, 21 errors, 4 warnings (exit 1). Remaining diagnostics are outside this feature's scope; broadcast scoped lint has zero errors and warnings.
- Raw check logs and the sanitized whole-lint report are retained in `evidence/`. No dependency installation, live provider/database operation, deployment or contract edit was performed.
