# 017 - auth typing and lint baseline

Continue v10 DEV-057 acceptance maintenance with one sequential module agent.
Base is previous committed module checkpoint. The cumulative suite currently passes 610 tests.

## Ownership

Own this spec folder and `elatetrips-node/src/modules/auth/**` only.
Read primary CLAUDE.md and constitution.md first. Shared frozen contracts may be read.
Never manually read another module's source, earlier specs, original environments or provider credentials.
Public imported types and compiler diagnostics may guide typing without opening imported source.
No shared contract, package, lint configuration or policy changes.

## Acceptance

- Remove the owned 2 errors and 0 warnings using narrow behavior-preserving typing or obsolete directive removal.
- No any, non-null assertion, suppression or unsafe cast replacement. Preserve HTTP responses, database/query behavior, money/configuration rules and method receiver binding.
- Existing focused module tests, scoped lint with zero warnings, typecheck, frozen contracts and build pass. Add regression tests only for substantive changed behavior.
- Run checks.mjs (fixture-only strict environment) to retain own evidence and actual remaining whole-lint counts. Do not use inherited verify:acceptance, which writes a different feature's evidence.
- No installs through the read-only node_modules junction, live environment/provider/database operations or deployment. Full cumulative suite follows all sequential module fixes.
- Local commit only owned paths after checks; hand off a clean branch. Do not claim full BRD/R1/R2 completion.

## Completed checkpoint

- Explicitly discard the password-hash binding after rest destructuring in login and its repository fake. Returned user shapes and secret exclusion remain unchanged; no new assertions, suppressions, configuration or policy values.
- `node .claude/elatetrips-specs/specs/017-auth-types/checks.mjs` passed: scoped lint (0 errors, 0 warnings), 69 focused tests, frozen contracts, typecheck and build. Existing secret-exclusion regression remains green; no substantive behavior change required new tests.
- Whole-project lint capture: 247 files, 22 errors and 4 warnings remain outside auth. The full cumulative suite is deferred to the final sequential stage.
- Final evidence is in `evidence/`; the initial run is preserved in `evidence/baseline/`. Its scoped lint records the two original errors; its whole-lint capture ran after the source edit. No live operations, installs or deployment performed.
