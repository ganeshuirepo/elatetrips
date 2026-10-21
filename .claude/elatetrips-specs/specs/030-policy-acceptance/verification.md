# 030 policy acceptance verification

Reviewed and verified on 2026-10-21 in branch `feature/030-policy-acceptance`.

Tested implementation checkpoint: `f516e5cfc81691b4021dd22c3779ecacd868169b`.
Policy module tree: `2ba643112f7551438f5f81a1554e00ebd4000f1f`.
No policy source or test changes were necessary. The acceptance checkpoint adds only
this feature's specification, supplied inputs, runner and evidence. No speculative
tests or new commercial behavior were added.

## Review result

Read the primary `CLAUDE.md` and `constitution.md`, this feature's specification,
runner and supplied backlog/BRD inputs, the five assigned policy files, and frozen
`policy.schema.json`, `defs/common.schema.json` and `events.md` contracts.
No other module source or earlier feature specification was manually read.

The existing 75 policy tests and exported API substantiate the following subset:

- Canonical policy data is separated from the internal tenant ownership wrapper.
  Quote policies require both partner and quote bindings; resolution additionally
  matches tenant, partner, quote and acceptance business date. Explicit ordered
  scopes and fallback configuration control selection. Multiple effective matches
  produce ambiguity rather than an implicit latest-version choice.
- Missing resolution or estimation decisions disable the affected operation.
  Empty or inapplicable refund bands do not invent a rate. An applicable peak
  override with no applicable band does not silently inherit base bands. Rates,
  rounding, monetary basis and date-boundary decisions come from supplied data.
- New acceptance requires an effective policy and the exact accepted policy ID
  and version. Accepted snapshots retain independent immutable policy, ownership,
  amount, trip date and versioned configuration. A later catalog change or policy
  expiry does not invalidate accepted terms at cancellation.
- Dates use real Gregorian validation and calendar ordinals, including leap and
  early-year behavior; new acceptance, cancellation, trip and peak boundaries are
  explicit. Threshold selection uses the greatest applicable days-before value;
  ambiguous peak endpoints fail closed under the chosen end-boundary semantics.
- Money is nonnegative safe integer minor units with exactly the five contract
  currencies. Percentage fields always mean division by 100. Bigint intermediate
  arithmetic and explicit floor/ceil/half-up/half-even rounding avoid precision
  loss. Accepted and captured bases differ explicitly; estimates cannot exceed
  captured money, and mismatched currency or over-capture is rejected. No FX or
  currency inference occurs.
- Strict parsers reject unknown fields, unsafe numbers, invalid dates, unsupported
  configuration, class instances, accessors and malformed/decorated/sparse arrays.
  Parsed outputs are independent and deeply frozen; caller/catalog/config mutation
  cannot change an existing accepted snapshot or estimate.
- The returned `policy.snapshotted` event matches the frozen envelope, actor/role
  enums, before/after structure and booking/policy/version payload. It is an
  internal proposal, not evidence of a committed audit record or confirmed booking.

## Trust and remaining integration work

The library does not authenticate or authorize caller-supplied catalog ownership,
context, acceptance, audit metadata, persisted snapshot or captured balance. A
structurally valid snapshot is not proof of customer consent or authenticity.
The SHA-256 fingerprint binds snapshot, decision configuration, ownership, command
and event inputs for advisory retry comparison; it is not a signature and provides
neither persisted uniqueness nor durable idempotence.

A future adapter must obtain trusted records and fresh authorization, validate the
current accepted commercial item/version/amount/currency and payment evidence,
and atomically enforce booking uniqueness, stable command/event IDs, fingerprint
retry checks and snapshot plus append-only audit/outbox persistence. Cancellation
requests, provider cancellation, inventory release and verified refund settlement
remain separate operations. The captured input is a trusted adapter responsibility,
not a verified balance or an accounting ledger maintained by this library.

DEV-004 coverage is limited to policy resolution and estimation configuration.
Purpose prompts, general scoring, SLAs, group tiers, tax/fee rules, provider
capabilities and release flags are not completed here. DEV-053 coverage is limited
to an exact policy-reference acceptance proposal with immutable amount/currency
and configuration; accepted cart/item reconciliation, finance responsibilities,
checkout, payment and paid supplier mutation remain unimplemented by this seam.
DEV-056 coverage is limited to accepted-snapshot refund estimates. Role/approval
evidence, provider cancellation, recovery orchestration, inventory release and
refund execution/settlement remain integration work. No inherited pooling refund
guarantees were introduced. Full DEV-004/053/056 or R1/R2 completion is not claimed.

## Final cumulative verification

Ran this feature's `checks.mjs` once after review, against the unchanged source
checkpoint above. Every command exited zero:

| Check | Exact result |
| --- | --- |
| Frozen contracts | 15 schemas, 20 fixtures |
| Typecheck | Pass |
| Application suite | 685 tests, 45 suites; 685 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo |
| Harness suite | 34 tests, 0 suites; 34 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo |
| Build | Pass |
| Whole-source lint | 252 TypeScript files; 0 errors, 0 warnings |

The 75 existing policy tests are included in the application suite; they are not
an additional test run. Raw command logs and sanitized lint diagnostics are in
`evidence/`; `summary.json` records exact counts and source/path checks.

The runner strips inherited environment values except its explicit operating-system
allowlist and supplies fixture-only JWT/admin values, an inert local database URI,
blank provider credentials and no runtime Mongo download. Existing read-only
`node_modules` and MongoDB 8.2.6 tooling were reused. No installs, provider/live
operations, deployment, push or main merge occurred. Inherited acceptance tooling
that writes feature 014 was not invoked.

Implementation commit paths were audited through Git metadata only: all 20 paths
are within the policy module or feature 029 evidence/specification. Implementation
source/docs/script whitespace checks passed, excluding raw logs and supplied
inputs. The new checkpoint path audit is restricted to feature 030; its staged
source/docs/script whitespace check also passes. There is no policy fix diff from
the tested implementation checkpoint. Final report edits do not change tested
source and do not require another full-suite run.
