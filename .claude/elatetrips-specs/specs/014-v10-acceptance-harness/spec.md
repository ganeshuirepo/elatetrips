# 014 - Backend acceptance harness (DEV-057 technical slice)

The user requests continued v10 development using sequential agents. Source backlog:
`C:/Users/pvgan/Documents/elatetrips-docs/ELate_Trips_Development_Backlog_v10.json`,
DEV-057. The verified feature-013 foundation is preserved in local commit `1d1572d`.
This separate branch/worktree extends its build-time acceptance tooling.

## Ownership

Own this spec folder, new `elatetrips-node/scripts/acceptance/` tooling/fixtures,
`elatetrips-node/eslint.config.mjs`, and the backend `package.json`/lockfile changes
needed to expose reproducible developer checks. Existing package/test/TypeScript
tooling may be read to integrate checks. Frozen contracts and their golden fixtures
may be read and copied into this feature's tooling fixture bundle with provenance.
No business module source or feature-013 source/spec edits. Existing tests can run
without reading/fixing unrelated module implementation. Other worktrees, the original
backend installation/environment and deployment files remain unchanged.

## Acceptance criteria

1. Backend scripts include reproducible `lint` and `test:contracts` checks. Lint
   inspects the backend TypeScript surface without suppressing existing diagnostics
   or presenting a selected-files pass as whole-repository success.
2. Contract replay validates the currently frozen schemas and canonical golden
   fixtures, with an explicit source/version/hash manifest. Candidate BRD extensions
   are not silently adopted. No frozen contract is edited.
3. Negative regression tests prove corrupted manifests/fixtures, incompatible schema
   references, invalid payloads and deliberate lint violations fail their check.
   New tooling is separately testable without altering live application state.
4. A repeatable combined verification report retains actual exits for contracts,
   lint, typecheck, full test and build. Existing failures stay visible, including
   the RFQ comparison failure present before this feature.
5. Tooling dependencies install only into this worktree. No original node_modules
   junction/checkout, environment, production database, provider or deployment is
   changed. Dependencies and their lockfile stay reproducible.

This task repairs the harness's technical gap. Passing canonical replay does not
certify new domain adapters, R1/R2 or full BRD completion. Any baseline lint findings
must be reported rather than hidden or fixed by crossing module ownership boundaries.
