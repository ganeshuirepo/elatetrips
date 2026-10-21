# 015 - RFQ comparison regression (DEV-007/057 maintenance)

The user requests sustained sequential development. Feature 014 restored backend
acceptance tooling in local commit `78f5a96`; the inherited application suite has
609 tests, 608 passes and one RFQ comparison failure: expected supplier name
`Coorg Trails`, observed `undefined`. Fix this existing comparison behavior within
its own isolated module ownership, preserving approved contracts and economics.

## Ownership

Own `elatetrips-node/src/modules/rfqflow/**` and this spec folder only, on branch
`feature/015-rfq-comparison` in the isolated worktree. Read own module/tests and the
frozen contracts at `D:/projects/elatetrips-experiences/contracts`. Existing build/
test/lint tooling may be invoked; no manual source reads or edits in other business
modules, repositories, common services, foundation or earlier spec folders.
Cross-module understanding must come from contracts and own boundary fixtures.

The new worktree reuses the controlled feature-014 tool installation through a
node_modules junction for read-only command execution. Do not install/update through
this junction. Mongo fixtures use the copied executable in this worktree's ignored
tooling cache. No original checkout, environment, provider or live database is used.

## Acceptance criteria

1. Reproduce the inherited focused failure before edits and identify whether its
   cause is comparison implementation or an invalid boundary fixture. Correct the
   cause without weakening name/price assertions or suppressing the failing test.
2. Comparison preserves canonical supplier identities and displays the correct
   supplier names and existing calculated prices. No new price, tax, threshold,
   ranking weight or policy is hard-coded. Existing supplier privacy is preserved.
3. Add focused regression coverage where needed for the actual defect, such as
   multiple suppliers/missing lookup results/duplicate or mismatched IDs. Keep
   unsupported input behavior explicit rather than inventing supplier data.
4. Fix the three inherited lint errors inside this owned module without disabling
   rules. Scoped RFQ lint, focused tests, typecheck, contracts and build pass.
5. A sequential reviewer verifies the combined harness and full application suite,
   retaining actual counts/exits and any unrelated remaining lint failures. No
   earlier evidence is overwritten. No unrelated module or frozen contract changes.

This fixes an existing path; it does not adopt proposed BRD contracts, enable new
commercial capabilities, deploy code or claim complete BRD/R1/R2 acceptance.
