# 029 policy-engine technical checkpoint

Date: 2026-10-21. Branch: `feature/029-policy-engine`. Owned source: `elatetrips-node/src/modules/policy/**`. This is internal technical groundwork, not completion of DEV-004, DEV-053, DEV-056, P4 or Gate R2.

## Verification evidence

The final command was run once after implementation:

```powershell
node .claude/elatetrips-specs/specs/029-policy-engine/checks.mjs
```

Results in `evidence/summary.json`:

- Focused policy tests: **75 passed, 0 failed, 0 skipped** (`focused-tests.log`).
- Scoped ESLint: exit 0, max warnings 0 (`scoped-lint.log`).
- Whole backend ESLint: **252 files, 0 errors, 0 warnings**, exit 0 (`whole-lint.json`).
- `npm run test:contracts`: exit 0; **15 schemas / 20 fixtures** (`contracts.log`).
- `npm run typecheck`: exit 0 (`typecheck.log`).
- `npm run build`: exit 0 (`build.log`).

An earlier scoped diagnostic passed 73 tests and scoped lint; its distinct logs are retained under `evidence/diagnostic-*`. The final run includes two additional acceptance tests for strict JSON arrays and exact accepted policy references. There were no failed check runs. Source/docs/script staged whitespace validation excludes unchanged supplied HTML/JSON and raw evidence logs.

`checks.mjs` runs every child with an OS-key allowlist plus fixture-only credentials, disabled provider settings and disabled runtime Mongo downloads. The existing dependency junction was treated as read-only; no installs or updates were made. No provider, environment file, live database, deployment or inherited acceptance reporter was used. This pure module did not need Mongo. The final cumulative application/harness suite remains a separate sequential acceptance stage.

## Exposed API and usage

Import functions and public immutable types from `elatetrips-node/src/modules/policy/index.ts`. All five entry points accept `unknown`, validate it, and return a frozen `Outcome<T>`:

| Function | Input | Successful value |
| --- | --- | --- |
| `validatePolicy` | Canonical policy JSON | Detached, deeply frozen canonical `Policy` |
| `resolvePolicy` | `{ catalog, context, resolution }` | Frozen `PolicySelection` with exact owner, policy, context and resolution config |
| `preparePolicySnapshot` | Resolution inputs plus `{ acceptance, estimation, audit }` | Frozen `SnapshotProposal` with snapshot and uncommitted `policy.snapshotted` event |
| `validatePolicySnapshot` | Trusted persisted snapshot JSON | Validated detached snapshot, without current-catalog resolution |
| `estimateRefund` | `{ snapshot, cancellation_date, trip_start_date, captured_amount }` | `RefundEstimate`, integer minor units and explicit currency |

Outcomes are `ok` with `value`, `invalid` with issue paths, `unavailable` with a reason, or `ambiguous` with a reason. Boundary adapters must map these into their own typed errors and loading/empty/error UI states. No HTTP/router/container integration is included.

Illustrative calling pattern (identifiers, values and configurations come from trusted callers; this snippet defines no commercial defaults):

```typescript
const result = preparePolicySnapshot({
  catalog: ownedPolicies,
  context: {
    tenant_id: authorizedTenantId,
    partner_id: acceptedPartnerId,
    quote_id: acceptedQuoteId,
    business_date: suppliedAcceptanceBusinessDate,
  },
  resolution: publishedResolutionConfig,
  acceptance: {
    booking_id: reservedBookingId,
    rfq_id: acceptedRfqId,
    policy_id: explicitlyAcceptedPolicyId,
    policy_version: explicitlyAcceptedPolicyVersion,
    trip_start_date: acceptedTripStartDate,
    amount: acceptedMoney,
  },
  estimation: approvedEstimationConfigOrNull,
  audit: {
    command_id: stableCommandId,
    event_id: stableEventId,
    actor: suppliedActor,
    actor_id: authorizedActorId,
    role: suppliedRole,
    ts: suppliedClockTimestamp,
  },
});
if (result.status === 'ok') {
  // Hand the complete proposal to the future authorized atomic adapter.
  // Returning this value does not save a booking or record a financial event.
  const proposal = result.value;
}
```

After a future adapter loads the accepted snapshot, estimation takes that snapshot only, plus supplied cancellation/trip dates and verified captured money. It never takes a replacement catalog or replacement calculation configuration. The caller-supplied trip date must match the accepted snapshot. Snapshot validation checks policy effectivity at the recorded acceptance business date; subsequent expiry has no effect on estimates.

## Validation and calculation semantics

- Canonical policy fields mirror frozen `policy.schema.json`; currencies and money mirror `defs/common.schema.json`. No frozen contract was changed. Tenant binding is a separate internal `{ tenant_id, policy }` catalog wrapper and internal snapshot metadata. Canonical policy has no tenant field.
- Inputs must be plain JSON data: unknown object/array fields, class objects, getters, symbols and sparse arrays are rejected. Parsers clone rather than freeze or mutate caller data. IDs follow the frozen length bounds with an additional nonblank check. Numeric business fields must be safe integers; percentages remain 0..100, with fixed mathematical denominator 100.
- Dates are actual Gregorian `YYYY-MM-DD`, years 0001..9999. Leap years and month lengths are validated. Ordinal calendar arithmetic avoids timezone/DST and JavaScript year 0..99 conversions. Business dates are explicit; timestamp-to-business-date conversion is not inferred. Audit timestamps require a real date, valid time and explicit offset; leap seconds are not supported.
- Safe scope semantics require platform policies to have no partner/quote binding; partner policies require a partner and no quote; quote policies require both partner and quote. These semantic checks intentionally tighten the permissive frozen schema. Repository adapters must supply verified ownership rather than invent missing bindings.
- Resolution config requires version, nonempty unique most-specific-first `scopes`, explicit `fallback` (`allow`/`deny`) and `effective_to` (`inclusive`/`exclusive`). Config may enable a subset of quote, partner and platform scopes in that order. Denied fallback stops after the first configured scope misses. Effectivity begins inclusively. Multiple matches at the first applicable scope are ambiguous, including duplicate records and overlapping versions; no latest-version or data-order selection occurs.
- Snapshot creation also requires the exact explicitly accepted policy ID/version to equal the resolved selection. It preserves all supplied policy terms and config, amount/currency and booking/RFQ/quote/partner/tenant references. The trip cannot precede the supplied acceptance business date. No consent, captured payment or supplier confirmation is inferred from these fields.
- Estimation config requires version, `rounding` (`floor`, `ceil`, `half_up`, `half_even`), `percentage_basis` (`accepted`/`captured`), `peak_basis` (`trip_start_date`/`cancellation_date`) and `peak_end` (`inclusive`/`exclusive`). Missing resolution disables selection; missing estimation config may still be snapshotted as null and explicitly disables refund estimation.
- Refund selection uses the largest supplied `days_before` threshold not greater than the calendar distance. Supplied array order is preserved but does not change threshold meaning. Duplicate thresholds are invalid. No matching band yields unavailable, not an invented 0%/100%. Cancellation before acceptance is invalid; after trip start is unavailable because no supported commercial rule was supplied.
- Peak ranges require valid ordered dates. Strict interior overlap is invalid. Shared endpoints can be adjacent under exclusive end configuration; inclusive shared endpoints return explicit ambiguity when both apply. An applicable peak replaces base bands; empty or inapplicable peak bands disable the estimate rather than falling back to base terms. Zero-length exclusive peak windows never match.
- Captured money must be validated nonnegative safe minor units, in accepted currency and no greater than accepted amount. Exact `bigint` numerator/divisor arithmetic implements configured rounding. Refunds cap at supplied captured money and therefore at accepted money. No floating point amount-times-percentage intermediate is used. Captured amount is caller evidence, not provider verification.
- No fees, taxes, markup, FX conversion, platform gap absorption, cancellation charges, supplier adjustment, pooled satisfaction/dead-man guarantee or noncontractual refund promise is invented. `flexibility_score` and deposit/balance terms are validated and retained, not derived into a pricing or collections workflow.

## Audit, fingerprint and future adapter responsibilities

The proposal contains `kind: policy_snapshot_proposal`, stable caller command ID, SHA-256 fingerprint, immutable snapshot and an uncommitted event. Its event envelope follows frozen `events.md`: event ID/type/actor/actor ID/role/time, RFQ/quote/booking subject, null before state, snapshot after state and `booking_id, policy_id, version` payload.

The fingerprint canonicalizes object key order and retains array order over the exact snapshot, complete event and command ID. It binds accepted amount/currency/references, selected exact policy content, owner context, business/trip dates, resolution and estimation settings, actor/role/clock and event/command IDs. Identical retry inputs reproduce it; changed inputs differ. Nonselected catalog rows are not part of an accepted snapshot. This digest is advisory comparison evidence, not a signature, authorization proof or stored idempotency record. Retry callers must retain original IDs and clock values.

The future adapter must authenticate and authorize tenant/resource access, load authoritative quote/partner ownership, verify exact accepted scope/item/amount/currency/policy and revision/expiry, enforce booking/command/event uniqueness and replay conflicts, and commit snapshot plus append-only audit/outbox atomically. It must prevent replacement of an already accepted snapshot. It also owns durable storage, transaction isolation, concurrent retry enforcement, audit access control, event delivery and reconciliation. This library cannot prove a supplied snapshot came from persistence or protect a forged trusted input. Actor/role enum validation is not live authorization.

An estimate performs no mutation and therefore emits no cancellation/refund state-change event. A proposal does not emit externally or prove a durable `policy.snapshotted` write. Provider cancellation, inventory release, financial approval, refund execution/settlement and customer communication remain distinct future operations. There is no transition to paid, confirmed, cancelled or refunded here.

## Partial backlog coverage and release limits

| Backlog item | Technical groundwork delivered | Still outstanding |
| --- | --- | --- |
| DEV-004 | Versioned configurable policy resolution/calculation, deterministic rule changes, explicit missing-config disablement | Prompts, scoring, validity/SLAs, partner modes, group tiers, taxes/fees, provider/payment capabilities, configuration publication/governance and release flags |
| DEV-053 | Exact policy acceptance reference, accepted minor-unit amount/currency and references, immutable policy+audit proposal | Accepted cart/proposal item/version bridge, repository/identity/checkout wiring, authoritative quote revalidation, supplier/tax/fee/markup/discount reconciliation, payment timing/ledger and constitutional commercial decisions |
| DEV-056 | Estimates from accepted snapshot after catalog expiry/change, exact configured rounding/bands/peaks/caps, no inferred settlement | Approved cancellation workflow and role/approval evidence, provider cancellation/status recovery, allocation release integration, refund ledger/execution/settlement and explicit decision on legacy guarantees |

Commercial owners still need to approve actual policies, hierarchy scope inclusion/fallback, effective/peak end boundaries, peak basis, monetary percentage basis, rounding, deposit/balance behavior, financial responsibility and supported cancellation timing. Identity, repositories, durable audit/idempotence, customer acceptance, checkout, providers, allocations and payment/refund ledgers remain unwired. Live money actions are not enabled and no task/release gate is claimed complete.
