# 021 - negotiation typing and lint baseline

Continue v10 DEV-057 acceptance maintenance with sequential agents. Base is previous committed module checkpoint; cumulative application tests pass.

## Ownership

Own this spec folder and elatetrips-node/src/modules/negotiation/** only. Read primary CLAUDE.md and constitution.md first. Shared frozen contracts may be read. Never manually read another module source, earlier specs or original environment. Public imported types and compiler diagnostics may guide types without opening imported source. No contract, package, lint configuration or policy edits.

## Acceptance

- Remove 1 errors and 0 warnings with narrow behavior-preserving types or obsolete directive removal.
- No any, non-null assertions, suppressions or unsafe replacement casts. Preserve API results, database behavior, economics/configuration and method receiver binding.
- Scoped lint zero warnings, existing focused module tests, typecheck, frozen contracts and build pass. Add tests only for substantive behavior changes. One final post-change check run is sufficient; do not repeat whole tests per module.
- Run own checks.mjs for strict fixture-only environment, sanitized whole-lint counts and retained evidence. Do not run inherited verify:acceptance (writes014 evidence).
- node_modules junction is READONLY; never install/update through it. No live database, provider, environment or deployment operations.
- Local commit only owned paths after checks; clean stopped handoff. Whole cumulative tests follow all module fixes. BRD/R1/R2 are not complete merely because these checks pass.
