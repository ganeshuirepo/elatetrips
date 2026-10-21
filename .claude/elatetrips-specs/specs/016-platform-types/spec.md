# 016 - Platform typing and lint baseline

Continue v10 DEV-057 acceptance maintenance using sequential agents. Base is local
RFQ checkpoint `23a1a42`; all 610 application tests and 34 harness tests pass.
Whole-backend lint still reports 35 errors and six warnings.

## Ownership

Own this spec, `elatetrips-node/src/container.ts`,
`elatetrips-node/src/common/logger.ts`,
`elatetrips-node/src/common/middleware/errorHandler.ts`, and
`elatetrips-node/src/repositories/MongoReadRepository.ts`, plus directly associated
new module-local tests if a substantive defect needs regression coverage. This is
the central platform/composition scope, not ownership of imported business modules.
Read primary CLAUDE/constitution first; shared frozen contracts may be read.
Do not read or edit other business module source or earlier specs. Public imported
types and compiler diagnostics may guide adapters; never bypass typing with a new
double cast or suppressions. No shared contract, package, lint-rule or policy edits.

## Acceptance

- Remove the platform's 11 errors and two warnings with narrow behavior-preserving
  types and removal of obsolete lint directives. Preserve logging, typed HTTP errors,
  repository results and dependency method receiver binding.
- No `any`, non-null assertion, lint suppression or replacement unsafe cast. If an
  actual port incompatibility blocks a safe fix, document its contract rather than
  inspecting another business module or silently changing economics/behavior.
- Scoped lint (zero warnings), typecheck, contracts, build and relevant existing
  module tests pass. Add tests only for meaningful changed behavior or a real defect.
- Capture actual results and the remaining full-lint counts without claiming full
  BRD/R1/R2 completion. No original environment, live database/provider or deployment.

The worktree's node_modules junction is read-only reuse of the controlled feature014
installation. Never install or update through it. Tests use fixture environment and
the existing copied Mongo8.2.6 executable as a read-only tooling artifact.

## Implementation and evidence (2026-10-21)

- Catalog repository instances use the public DTO types. Option/package DTOs are
  derived from the catalog service's public constructor port, without reading
  imported implementation source.
- The generic repository accepts the structural query operations it uses, plus
  the existing subclass's `create`/`findOneAndUpdate` surface through Mongoose's
  public types. It preserves filters, projections, lean results, nullability and
  model method receivers. No method is extracted or rebound.
- Removed obsolete inline lint directives. Error middleware explicitly consumes
  `_next` while retaining the four-argument signature Express requires. Logging
  and error response behavior are unchanged.
- No new casts, suppressions, business values or domain state transitions were
  introduced; no new audit event is applicable. No new tests mirror these type
  annotations or directive removals.

Run checks from this worktree using
`node .claude/elatetrips-specs/specs/016-platform-types/check.cjs <check>`.
The checked-in runner invokes the Node/npm CLI directly, with a case-insensitive
OS environment allowlist and explicit fixture overrides; it never inherits
application credentials, loads original environment files, installs packages or
uses live providers. Exact child commands/status are in `evidence/*-result.json`;
stdout/stderr are in the corresponding logs. Lint JSON removes every `source`
property before saving.

| Check | Result |
| --- | --- |
| `typecheck` / `npm run typecheck` | Pass |
| `contracts` / `npm run test:contracts` | Pass: 15 schemas, 20 fixtures |
| `build` / `npm run build` | Pass |
| `lint` / ESLint four owned files, `--max-warnings 0` | Pass: 0 errors, 0 warnings |
| `lint-all` / ESLint `src` | Expected remaining baseline: 24 errors, 4 warnings |
| `test src/common/db/schema.integrity.test.ts src/modules/admin/console.partner.test.ts src/modules/admin/console.guard.test.ts src/modules/rfqflow/rfqflow.test.ts` | Pass: 88 tests, 11 suites, zero failures |

The first test invocation used `npm run test -- <four paths>`. Its script already
contained `src/**/*.test.ts`, so this inadvertently ran all 610 application tests:
610 passed, zero failures, 45 suites. The exact output/command is retained as
`test-full-incidental.*` and `test-full-incidental-result.json`. The runner was
corrected to invoke `node -r ./scripts/register-ts.js --test <explicit paths>`;
the intended four-file result above is retained separately as `test.*` and
`test-result.json`. Future scoped runs require explicit paths. No further full
suite was run; the final combined acceptance/harness run remains with the owner.

Scoped baseline was 11 errors and two warnings; full baseline was 35 errors and
six warnings. Remaining lint findings belong to later sequential modules. This
checkpoint does not claim whole-backend zero-lint, final combined acceptance,
original environment acceptance, BRD completion, R1/R2 completion or deployment.
