# Backend acceptance tooling

Feature 014 adds missing backend `lint` and `test:contracts` checks and a retained
verification runner. This is the DEV-057 technical slice; existing application
diagnostics and the separately verified RFQ regression remain visible. It does not
complete DEV-057, the BRD, domain adoption or Gates R1/R2.

Run from `elatetrips-node`:

```powershell
npm.cmd run test:harness
npm.cmd run test:contracts
npm.cmd run lint
npm.cmd run verify:acceptance -- review-unique-label
```

The full runner executes harness tests, contract replay, full backend lint,
typecheck, full application tests and build, in that order, continuing after failed
checks and returning nonzero if any fail. It retains separate stdout/stderr,
machine-readable lint diagnostics and actual exits in this spec's `evidence/<label>`
folder. Labels cannot overwrite prior evidence. `tooling` as the second argument
explicitly omits the full application suite for a tooling-only handoff. Historical
reports state their mode; omitted tests are not implied to pass.

`evidence/tooling-complete/` contains the final implementation-stage check sequence.
`initial` and `tooling-v2` retain earlier diagnostic/configuration stages. The initial
lint permitted existing inline configuration; the final configuration prohibits
inline suppression and reports the additional previously hidden diagnostics.

The reviewed full lint covers 247 TypeScript source/test/declaration files and
reports 38 errors and 6 warnings. The feature-013 foundation/JWT paths have zero
errors and warnings across 25 files after their separate owner fixed eight errors
in commit `1f6db641e29138b56f372a4eff3ee8f82ae8d9df`. The remaining 222 files retain
38 errors and 6 warnings. Historical `tooling-complete` evidence retains the prior
46-error/6-warning result. No existing module was edited or its source manually
read under feature 014. Whole-backend lint remains red; a selected-files pass is
not substituted.

## Frozen contract provenance

The local `scripts/acceptance/frozen` bundle contains every frozen JSON document:
15 draft-2020-12 schemas and 20 golden fixtures. Source repository:
`elatetrips-experiences`, commit `e8dc98fce0d84f5223a3615f50001f0eb4b29922`,
directory `contracts`, clean for that path when snapshotted. The manifest records
every schema ID, fixture mapping and digest. Source documents name historical
freezes differently (constitution v1.1; CLAUDE additions v1.3); no uniform release
label or newer owner adoption is inferred. No proposed v10 contract is included.

Digests use SHA-256 of UTF-8 canonical JSON, recursively sorting object keys and
preserving array order and parsed JSON values. This explicit algorithm normalizes
whitespace/CRLF and is not a claim of RFC 8785 compliance or raw-file equivalence.
Replay validates the manifest shape, exact file inventory, paths, hashes, schema
identities, every schema and all fixtures. AJV strict mode and date formats are
enabled. References resolve only through locally registered schemas; there is no
network loader, coercion, default insertion or removal of additional properties.

Replay checks the snapshot's JSON schema compatibility. It does not separately
assert the raw-byte checksum semantics embedded in the experiences export's own
manifest, import business data or certify financial/state-transition rules.

The explicit maintenance command below rewrites only the feature's own snapshot;
ordinary contract replay never changes files. A maintainer must verify source
provenance and review/replay any update; hashes cannot protect against a deliberate
joint change to the bundle and its manifest.

```powershell
node scripts/acceptance/snapshot.mjs <frozen-contract-directory> <source-commit>
```

## Isolated dependencies and tests

Pinned development tools: ESLint 9.39.4, TypeScript ESLint parser/plugin 8.63.0,
AJV 8.20.0, AJV formats 3.0.1. Offline installation first failed with ENOTCACHED;
the network fallback installed into this worktree with lifecycle scripts disabled.
All 297 preexisting locked packages retain their version, resolved URL and integrity.
`node_modules` is a real isolated directory, not a junction. Setup evidence is in
`evidence/setup.json`. Existing transitive deprecation notices were emitted by npm;
no runtime dependency upgrade was attempted.

The runner drops ambient application secrets, NODE_OPTIONS/NODE_PATH and dotenv
injection, supplies fixture-only credentials, disables providers and points the
application URI at unreachable local port 1. Database tests create disposable Mongo
instances using the copied, version-verified 8.2.6 executable in ignored
`.claude/.cache/014-acceptance/`; runtime downloading is disabled. Recreate that
local cache before running the full suite on a fresh worktree. No original `.env`,
original `node_modules`, production database, provider or deployment was used.

Git evidence uses an exact-worktree `safe.directory` command argument because the
sandbox account differs from the checkout owner. It changes no global Git config.
The fixture runner mutates only test databases and local build/evidence outputs;
this tooling introduces no application business mutation or audit-event contract.

The sequential review ran the actual full combined runner on the integrated
foundation commit. `evidence/integrated-review/` records 34 passing harness tests,
15 compiled schemas, 20 passing fixtures, successful typecheck/build and the full
application suite: 609 tests, 608 passing, one existing RFQ comparison failure and
zero skipped. Full lint and full tests return 1; the combined runner returns 1.
`evidence/review-audit.json` independently verifies the exact frozen source inventory
and canonical hashes, preserved 297 original lock packages and ignored local cache.
See [verification.md](verification.md) for review findings and sequential handoffs.
