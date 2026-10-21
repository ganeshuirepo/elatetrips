# 015 implementation evidence

Implementation and sequential full-suite review complete. Worktree:
`D:/projects/elatetrips-experiences/.worktrees/v10-rfq-comparison`, branch
`feature/015-rfq-comparison`, base `78f5a96`. No commit or merge performed.

## Cause and correction

The inherited comparison test used the real clock with quote validity
`2026-10-01`. On 2026-10-21 both fixture quotes were expired. The existing
`onQuotesShortlisted` expiry filter returned before supplier-name resolution or
mail creation, so reading the absent summary yielded the string `undefined`.
This was a time-dependent test-fixture defect, not a supplier-lookup defect.

The shared quote fixture now uses the frozen quote/common schemas' full ISO
date-time form, `2026-10-01T00:00:00.000Z`; the comparison test injects the
service's existing clock seam at `2026-09-30T00:00:00.000Z`. Every original
supplier-name, unresolved-ID fallback, minor-unit price, partial-row and count
assertion is retained. No future-date workaround or production rule changed.

One new regression reuses the same offer at validity minus 1ms, exact validity,
and validity plus 1ms. The first two produce the expected name and INR 84,000;
the third produces no additional mail and performs no supplier lookup. This
preserves the existing strict `until < now` predicate, including live equality.
Canonical `sup-1` and the original integer-minor-unit money remain unchanged.

The three inherited explicit-any SMTP fake casts were replaced with a typed
Nodemailer custom transport plugin that captures mail entirely in memory. The
existing success, redirect, and failure assertions still run; no SMTP socket
or provider is used.

## Actual checks

| Check              | Before edits                          | After edits                                                  |
| ------------------ | ------------------------------------- | ------------------------------------------------------------ |
| Focused RFQ tests  | Exit 1; 28 tests, 27 passed, 1 failed | Exit 0; 29 tests, 29 passed, 0 failed/skipped/cancelled/todo |
| Scoped strict lint | Exit 1; 3 errors, 0 warnings          | Exit 0; 0 errors/warnings                                    |
| Backend typecheck  | Not rebaselined                       | Exit 0                                                       |
| Frozen contracts   | Not rebaselined                       | Exit 0; 15 schemas, 20 fixtures                              |
| Backend build      | Not rebaselined                       | Exit 0                                                       |

Commands, from `elatetrips-node`:

```text
node -r ./scripts/register-ts.js --test src/modules/rfqflow/rfqflow.test.ts
node ./node_modules/eslint/bin/eslint.js "src/modules/rfqflow/**/*.ts" --max-warnings 0
npm.cmd run typecheck
npm.cmd run test:contracts
npm.cmd run build
```

Captured before/after output and actual process exits are in the neighboring
`.log` files (trailing whitespace on blank baseline lines normalized).
`verify-focused.ps1` repeats only the after checks and writes exclusively
this feature's evidence. Invoke from the worktree with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .claude/elatetrips-specs/specs/015-rfq-comparison/verify-focused.ps1
```

The implementation-stage wrapper overwrote selected application/provider keys;
the reviewer strengthened it to remove all ambient variables except required OS
names before supplying fixture credentials, disabled live Mongo URI, empty
provider/SMTP settings, and local Mongo 8.2.6 with downloading disabled. The old
logs remain historical. An injected Node-options/path/unrelated-secret child probe
now verifies the stricter wrapper (`evidence/environment-probe.*`). It reads no original `.env` and installs nothing
through the shared read-only dependency junction. The process-only execution
policy option is needed because this host disables script execution by default.

Only `rfqflow.test.ts` and this spec folder changed. Production lookup, expiry,
money, privacy, configuration and audit behavior are unchanged. Frozen supplier,
quote and common schemas supplied boundary evidence; no other module source was
read. The reviewer ran all checks sequentially into `evidence/sequential-review/`:
610 application tests pass, 34 harness tests pass, contracts/typecheck/build pass,
and full lint retains 35 errors and 6 warnings outside this RFQ module. See
`verification.md` for actual exits and scope. This evidence makes
no R1/R2 or wider BRD-completion claim.
