# 024 completion

- Replaced two loose null comparisons in `pricing.service.ts` with explicit null and undefined comparisons. Both nullish branches, pricing arithmetic, repository calls, policy/configuration and response shapes are preserved.
- Initial scoped lint: 2 errors, 0 warnings. Final scoped lint: 0 errors, 0 warnings.
- One final `node .claude/elatetrips-specs/specs/024-pricing-types/checks.mjs` run passed scoped lint, contracts (15 schemas, 20 fixtures), typecheck and build.
- Focused tests are not applicable: pricing has no existing module-local test files. No tests were added for this comparison-only cleanup. Final cumulative application tests remain required.
- Sanitized whole-repository lint captured 247 files, 5 errors and 2 warnings outside this module. Its exit status is 1; this is retained evidence, not a whole-repository green claim.
- Raw check logs and sanitized lint evidence are retained in `evidence/`. No dependency installs, contract/package/rule edits, live operations, deployment or inherited acceptance runner were used.
- BRD and Gates R1/R2 completion are not implied by this maintenance checkpoint.
