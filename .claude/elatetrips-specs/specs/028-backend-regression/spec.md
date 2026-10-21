# 028 - Cumulative backend regression

Verify the sequential v10 backend lint maintenance batch on the committed feature027 checkpoint.

## Ownership

Own this spec folder only. Read primary CLAUDE.md and constitution.md first, shared frozen contracts if needed. Do not manually inspect business source, earlier feature specs, environments or providers. Automated whole-backend validation and metadata-only Git path auditing are authorized. No source/package/contracts/lint-rule edits in this stage; if a substantive failure appears, report and hand off the responsible module rather than widening scope.

## Acceptance

- Run own checks.mjs with its strict OS allowlist and fixture-only child environment, read-only controlled dependencies and Mongo8.2.6 binary. No installs, inherited verify:acceptance reporter, live/provider calls, production environment, deployment, push or main merge.
- Require application tests, harness tests, frozen contract replay, typecheck, build and actual whole-source lint all green. Capture exact application/harness pass/fail/skip counts and schema/fixture counts. Lint must have zero errors and warnings.
- Audit the provided scopes.json using Git metadata only: each of twelve checkpoints changed only its assigned source paths and own spec. Confirm current source diff passes whitespace check and capture clean status. No manual cross-module source reads.
- Retain raw logs and sanitized diagnostics without source fields, summary.json and a concise verification.md explaining outcome, tested checkpoint, validation limits and unresolved BRD integration/R1/R2. This batch does not prove complete BRD delivery, approved new contracts, real adapters, external services, frontend/live E2E or human gate acceptance.
- Commit only this exact ignored spec folder after successful review, record stopped clean handoff. No broad speculative code review/testing once required checks pass.
