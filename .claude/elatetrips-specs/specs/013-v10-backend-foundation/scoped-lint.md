# Feature 013 strict lint remediation

The acceptance-harness tooling reported eight diagnostics in feature 013. Six
transaction-capability checks now compare session timeout metadata explicitly
against both `null` and `undefined`, preserving the existing rejection of absent
logical sessions. Delivery snapshots now construct an explicit projection of
allowed metadata fields, excluding the private lease token. The existing
missing-creation-scope test constructs its deliberate omission directly.

No lint rule, inline suppression, production route, provider adapter, shared
contract or business policy changed. Existing standalone/privacy/transaction
acceptance cases validate these behavior-preserving changes; no redundant tests
were added.

The scoped lint command executes the shared acceptance-harness ESLint tooling
against only `src/modules/foundation/**/*.ts` and
`src/modules/auth/token.service*.ts`, with `--max-warnings 0`. Tool configuration
and the cached Mongo binary are consumed read-only. No other feature's source or
specification is inspected or edited.

Reproduce the retained checks from this feature worktree root:

```powershell
node .claude/elatetrips-specs/specs/013-v10-backend-foundation/lint-checks.mjs
```

`evidence/scoped-lint/` retains the exact scoped lint, typecheck, focused test and
build commands, raw logs, exit codes and starting commit. Actual results are:

- Scoped strict lint: exit 0, zero errors and warnings.
- Typecheck: exit 0.
- Focused foundation/JWT tests: exit 0; 366 pass, zero fail and zero skipped.
- Build: exit 0.
- Changed source/spec formatting and scoped whitespace checks: pass.

The fixture environment
clears provider/SMTP keys and production Mongo URI, uses synthetic JWT/admin keys,
does not load the original environment, and executes the cached Mongo 8.2.6 binary
with runtime downloads disabled. No production database or provider is called.

This is scoped lint remediation only. The historical full-suite evidence remains
unchanged at 609 total, 608 pass and the one baseline RFQ failure. Whole-backend
lint retains previously reported legacy diagnostics outside feature 013; this
work does not claim a whole-backend lint pass or completed BRD/DEV-005/006/008/R1/R2.
Final full-application verification belongs to the acceptance-harness integration
review after this isolated feature commit is adopted.
