# v10 backend identity, persistence and event-processing foundation

Branch `feature/013-v10-backend-foundation`, isolated from the supplied backend's
`feat/partner-identity-link` checkout at `ce83482`. Backend path is
`elatetrips-node/` inside this worktree. User confirmed the source checkout on
21 October 2026. Original environment/deployment files were not copied or changed.

## Implementation

- Hardened the existing user JWT adapter: validates runtime identifier type/content,
  rejects explicitly other-scoped credentials and restricts verification to its
  existing signer's HS256 algorithm. Existing `{phone}` user credentials and the
  UnauthorizedError/401 boundary are preserved. Nine regression cases failed before
  this change and pass after it; this is boundary hardening, not a claim that an
  unsigned external attacker could forge a valid token.
- Added a local, read-only stable identity and membership/scope engine in
  `src/modules/foundation/identity.ts`. It resolves a verified legacy identifier via
  an active server account lookup, then checks current exact-scoped server membership
  and explicit permission configuration. Default configuration grants nothing.
- The request-local principal cannot be reconstructed from browser JSON. Token role
  claims, cached-role fallback and implicit admin wildcard do not grant permissions.
- Membership revocation, start/expiry, malformed data/policy and unavailable stores
  fail closed. Customer/organization/partner boundaries are covered by tests.

There are 366 added passing tests: 14 credential, 30 identity/scope, 34 persistence,
2 JSON/encryption, 30 outbox, 38 projection, 35 transaction, 37 recovery, 25 runner,
20 lease-renewal, 31 managed-consumer, 42 delivery-history and 28 runtime cases. Identity
uses fixture account/membership ports and local JWT signatures. Persistence uses
real local replica-set transactions, including forced server insert failures and
concurrent writes. No production account, provider or database is called.

The unmounted persistence adapter commits a versioned record, immutable snapshot,
encrypted before/after audit, pending outbox reference and retry receipt atomically.
It enforces expected revisions, exact retry replay, immutable record modes, fresh
scope authorization and authenticated encrypted storage. See [persistence.md](persistence.md)
for the operation boundary, indexes, acceptance evidence and integration limits.

The explicit outbox worker adds configurable leases/retries, expired-worker recovery,
version/token fencing, authenticated event loading and atomic append-only delivery
journals. It invokes a supplied trusted handler outside the database transaction and
provides at-least-once delivery; consumers must deduplicate and handle ordering.
See [outbox.md](outbox.md). No provider adapter or scheduler is mounted.

The snapshot projection reloads authenticated source events, enforces contiguous
revisions and the before/after chain, and commits encrypted state/receipt/audit
atomically. Duplicates are no-ops, gaps defer and stale events cannot overwrite newer
state. Authorized reads use fresh memberships. Real producer/outbox/projection
tests prove replay after acknowledgment loss and out-of-order recovery. See
[projection.md](projection.md); approved business projections remain integration work.

The multi-record coordinator shares the store's staging/commit path and atomically
commits all record artifacts plus an encrypted group receipt. It requires explicit
versioned policy and a pure guard, reauthorizes every member, preserves exact retry
results and supplies snapshot-consistent group reads. See [transaction.md](transaction.md).
No booking/inventory/financial rule or endpoint is enabled by this mechanism.

The recovery port adds scoped metadata inspection and explicit dead-delivery retries,
with current permissions, configured budgets/reasons, expected queue versions and
atomic operator audit/receipts. Queue format 2 preserves lifetime attempts and
recovery counts across cycles. See [recovery.md](recovery.md); no operator route or
provider is mounted.

The explicit runner composes that worker with exact kind/schema routes, configured
polling and bounded infrastructure retries. It prevents overlapping starts,
interrupts idle/backoff timers on abort and awaits active consumer acknowledgment.
Metadata-only diagnostics and typed failures exclude source content and private
exceptions. See [runner.md](runner.md). Application startup/supervision and approved
production handlers remain pending; construction starts no work.

Trusted consumers can explicitly renew a live lease under an optional versioned
extension-count/lifetime policy. Renewal preserves attempts and commits queue/audit
atomically, with exact ownership fencing and serialized completion. The runner
forwards this process-local control. See
[renewal.md](renewal.md). Omitting policy disables renewal.

The opt-in [managed-consumer wrapper](managed-consumer.md) supplies configured
heartbeats and cooperative deadlines, draining consumer and renewal work before
acknowledgment. The [delivery runtime](delivery-runtime.md) composes exact routes,
the wrapper, worker and runner with detached keys/configuration and lazy storage
initialization. Construction starts no work; no application startup is mounted.

The read-only [delivery history](delivery-history.md) reauthorizes every page,
separately gates actor/policy details and binds encrypted continuation to source,
user, policy and snapshot anchors. Its checks cover returned rows and anchors;
plaintext journal history is not cryptographically authenticated.

## Existing identity findings

The current access-token contract identifies a user by `{phone}` and strips extra
role claims. It is not an organization or partner membership. Refresh credentials
are opaque random values stored hashed with expiry, rather than access JWTs. The
existing account auto-activation setting is configurable; an active account does
not prove phone/OTP verification or partner contracting. Signed operational card
and money-affecting OTP protections remain their existing separate controls.

## Validation

From the backend directory:

```powershell
npm.cmd run typecheck
node -r ./scripts/register-ts.js --test src/modules/auth/token.service.test.ts "src/modules/foundation/*.test.ts"
npm.cmd run test
npm.cmd run build
```

Or from this worktree root, use the retained-environment runner:

```powershell
node .claude/elatetrips-specs/specs/013-v10-backend-foundation/checks.mjs verification
```

The runner uses fixture keys, disables real provider credentials/database URI, and
does not load the supplied checkout's `.env`. `evidence/baseline/` and `evidence/final/`
retain the identity results; `evidence/persistence/` has the persistence comparison;
`evidence/outbox/` and `evidence/projection/` retain those comparisons;
`evidence/transaction/` retains group results; `evidence/recovery/` retains recovery
results; `evidence/runner/` and `evidence/renewal/` retain those historical results.
The three sequential implementation handoffs retain focused evidence in
`evidence/managed-consumer/`, `evidence/delivery-history/` and `evidence/delivery-runtime/`.
The latest full verification is `evidence/sequential/`: typecheck/build pass, 608 tests pass and
the same one baseline RFQ test fails.
See [sequential-verification.md](sequential-verification.md) for review and ownership evidence.
The backend package has no lint or test:contracts script;
neither is invented or presented as passing. Canonical contract replay remains in
the experiences repository.

## Next dependencies

Later [scoped strict-lint remediation](scoped-lint.md) preserves the historical
aggregate evidence above. Its own commands/logs are retained separately in
`evidence/scoped-lint/`; whole-backend lint and final integrated verification remain
the acceptance harness's responsibility.

1. Owner adoption of Δ-012 and accepted version/gate reconciliation in the experiences
   worktree; candidate contracts do not authorize mounting new APIs.
2. Real account/membership adapters and server-loaded resource resolvers, per-request
   route wiring, current-session/role revocation and signed-card/OTP compatibility.
3. DEV-006 approved business record adapters and domain transaction guards, legacy
   migration, replay-safe consumer/provider adapters, runner deployment/supervision,
   retention/keys/DB roles and production capability tests.

No new route or database connection is mounted in the server and no notification is
sent. Database writes occur only in disposable acceptance fixtures. Neither the full
BRD, DEV-005/006/008 nor R1/R2 is marked complete by these technical slices.
