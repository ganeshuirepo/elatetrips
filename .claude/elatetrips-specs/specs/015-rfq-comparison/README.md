# Deterministic RFQ comparison regression

The inherited comparison failure came from a fixture that expired on 1 October
2026 while its test used the machine clock. The existing production expiry filter
correctly withheld the summary before supplier lookup. The test now injects a fixed
pre-expiry clock and an ISO validity timestamp. Every original supplier-name,
fallback-ID, price, partial-row and count assertion remains.

A new regression checks the same quote one millisecond before, exactly at and one
millisecond after validity. It preserves the existing strict `until < now` rule:
the first two comparisons send; the last withholds mail and avoids supplier lookup.
Canonical supplier identity and minor-unit money remain unchanged. Typed in-memory
Nodemailer transport replaces three explicit-any casts without opening sockets.

Sequential review ran the actual full checks: 610/610 application tests, 29/29 RFQ
tests, 34/34 harness tests and 15 schemas/20 fixtures pass. Typecheck and build pass;
RFQ lint is clean. Whole-backend lint remains nonzero with 35 errors and 6 warnings
in other modules, so the combined runner correctly exits 1.

From the worktree root, retain a fresh full report with:

```powershell
node .claude/elatetrips-specs/specs/015-rfq-comparison/verify-full.mjs unique-label
node --test .claude/elatetrips-specs/specs/015-rfq-comparison/verify-environment.test.mjs
```

The Windows runner uses the npm CLI beside the active Node installation, runs every
check after failures and refuses to overwrite an evidence label. It writes only
this feature's evidence and local build/test outputs. Both wrappers strip ambient
application secrets and runtime injection, supply fixture settings and disable
Mongo downloads. Existing original `.env`, providers and installations are unused.
The dependency junction is for read-only execution; do not install through it.

[Verification](verification.md) records actual exits, historical evidence and the
remaining limits. No production implementation, contracts, commercial policy or
audit behavior changed. Full BRD development and Gates R1/R2 remain incomplete.
