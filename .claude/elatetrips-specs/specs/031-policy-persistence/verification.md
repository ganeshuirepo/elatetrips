# 031 verification and sequential producer handoff

The foundation now provides a concrete encrypted Mongo write-once policy snapshot service. It reuses `openVersionedStore`, `openRecordTransaction`, current identity authorization, authenticated JSON protection, audits, outbox and durable receipts. No policy implementation was read, no frozen contract was changed, and no route, container, provider or environment file was changed.

## Public API for 032

Import from `../foundation/policy-snapshot` (relative to the producer's module):

```ts
import {
  openPolicySnapshotStore,
  snapshotPolicySchema,
  type PolicySnapshot,
  type PolicySnapshotEvent,
  type PolicySnapshotCommand,
  type PolicySnapshotConfiguration,
  type PolicyBookingBinding,
  type PolicySnapshotOptions,
  type PolicySnapshotResult,
  type PolicySnapshotStore,
} from '../foundation/policy-snapshot';

function openPolicySnapshotStore(options: PolicySnapshotOptions): Promise<PolicySnapshotStore>;
interface PolicySnapshotStore {
  commit(token: string, input: PolicySnapshotCommand): Promise<PolicySnapshotResult>;
  read(token: string, bookingId: string): Promise<PolicySnapshotResult | null>;
}
```

`PolicySnapshotOptions` requires every dependency below; there is no enabled default configuration:

```ts
interface PolicySnapshotOptions {
  client: mongo.MongoClient;
  database: string;
  namespace: string;
  keys: StorageKeys; // Existing foundation/encrypted-json type.
  clock(): string; // ISO timestamp from a trusted server clock.
  tokens: ITokenService; // Existing token service: sign/verify.
  accounts: AccountDirectory; // findByTokenIdentifier(identifier): Promise<unknown>.
  memberships: MembershipDirectory; // listForUser(userId): Promise<unknown>.
  loadPermissions(): Promise<unknown>; // Existing strict permissionPolicySchema.
  configuration: PolicySnapshotConfiguration;
  resolveBooking(bookingId: string, principal: VerifiedPrincipal): Promise<unknown>;
  validateProducer(snapshot: Readonly<PolicySnapshot>): boolean;
}
interface PolicySnapshotConfiguration {
  adapterId: string;
  revision: number; // Positive safe integer.
  readAction: 'booking.read';
  writeAction: 'booking.write';
  transaction: { policyId: string; revision: number; maxRecords: number };
  // Positive version; explicit maxRecords >= 2 for booking plus event-ID reservation.
}
interface PolicyBookingBinding {
  bookingId: string;
  quoteId: string;
  partnerId: string;
  tenantId: string;
  contextId: string;
  scope: { kind: 'customer' | 'organization' | 'partner'; id: string };
  eventActor: 'customer' | 'ops' | 'supplier' | 'system' | 'ai';
  eventRole: 'customer' | 'dmc' | 'hotel' | 'provider' | 'ops' | 'platform';
}
interface PolicySnapshot {
  snapshotId: string;
  bookingId: string;
  quoteId: string;
  partnerId: string;
  tenantId: string;
  contextId: string;
  policy: z.infer<typeof snapshotPolicySchema>;
  body?: unknown; // Zod unknown inference; runtime requires this key and valid canonical JSON.
}
interface PolicySnapshotCommand {
  commandId: string;
  correlationId: string;
  snapshot: PolicySnapshot;
  event: PolicySnapshotEvent;
}
interface PolicySnapshotEvent {
  event_id: string;
  type: 'policy.snapshotted';
  actor: PolicyBookingBinding['eventActor'];
  actor_id: string;
  role: PolicyBookingBinding['eventRole'];
  ts: string;
  subject: { booking_id: string; quote_id?: string; rfq_id?: string };
  before: null;
  after?: unknown; // Runtime requires key; canonical equality to snapshot.body.
  payload: { booking_id: string; policy_id: string; version: number };
}
interface PolicySnapshotResult {
  readonly commandId: string;
  readonly snapshot: Readonly<PolicySnapshot>;
  readonly event: Readonly<PolicySnapshotEvent>;
  readonly receipt: Readonly<{ revision: number; eventId: string }>;
}
```

The runtime result is recursively frozen and detached, including unknown body and nested policy terms. The TypeScript `Readonly` surface is shallow. All identifier fields use nonempty, trimmed strings without NUL, at most 128 characters. Technical schema bounds reproduce the frozen policy schema, including percentage bounds; no rates or business thresholds are supplied by this service.

Usage with server-installed dependencies and an already prepared producer proposal:

```ts
const store = await openPolicySnapshotStore(serverOptions);
// serverOptions.resolveBooking must load authoritative server ownership and context.
// serverOptions.validateProducer must validate the exact body/metadata projection.
const input: PolicySnapshotCommand = {
  commandId: requestCommandId,
  correlationId: requestCorrelationId,
  snapshot: {
    snapshotId: preparedSnapshotId,
    bookingId: serverBookingId,
    quoteId: serverQuoteId,
    partnerId: serverPartnerId,
    tenantId: serverTenantId,
    contextId: serverContextId,
    policy: canonicalEffectivePolicy,
    body: preparedImmutableSnapshot,
  },
  event: preparedPolicySnapshottedEvent,
};
const accepted = await store.commit(requestToken, input);
const exactRetry = await store.commit(requestToken, input);
const current = await store.read(requestToken, serverBookingId);
```

`preparedPolicySnapshottedEvent.after` must be canonically equal to `preparedImmutableSnapshot`. The store checks event type, booking subject, optional quote subject, policy reference/version, canonical partner/quote links, exact body/after equality, current authenticated actor ID and trusted actor/role mapping. The canonical policy is the strict frozen policy core; producer-only fields belong inside `body`.

The required **trusted** `validateProducer` must validate the complete producer body, acceptance/provenance evidence and its exact projection onto snapshot ID, booking, quote, partner, tenant, context and canonical policy. Merely returning `true` for arbitrary JSON is not an integration. Keep this validator pure and schema based; do not re-resolve mutable catalog terms during read/replay. `resolveBooking` must load authoritative ownership and enforce brand/module/tenant isolation; it must not echo HTTP body fields. Existing identity scopes have no separate brand/module fields, so that isolation belongs to this mandatory server adapter. Neither a caller hash, token identity, equality check nor this store establishes customer consent, OTP, supplier acceptance or payment.

## Persistence and event accounting

First commit atomically inserts two immutable records, two revisions, two encrypted internal foundation audit records, **two INTERNAL foundation outbox records**, two durable subreceipts and one encrypted group receipt. One record is the booking snapshot; the other is a reference-only domain event ID reservation. The transaction policy ID and command ID provide namespace-wide command dedupe; the event reservation prevents cross-booking event ID reuse. Booking IDs themselves are stable within the dedicated namespace. Configure a dedicated namespace and stable transaction policy ID; migrations require deliberate handling.

There is exactly **one nested canonical `policy.snapshotted` payload in the audit stream**: authenticate the foundation event, select `kind === 'policy-snapshot'`, and use `event.after.request.event`. The `policy-snapshot-event` audit contains references only. The foundation audit/outbox event ID in `result.receipt.eventId` differs from the preserved domain `result.event.event_id`. A future publisher must select the snapshot kind and preserve the nested domain event ID; do not publish the reservation or treat both internal outbox entries as policy events. **No domain publisher/delivery adapter is wired in 031. 032 must not claim queue dispatch solely from this seam.**

Exact retries return the original record/event receipt. Changed input, body, actor membership/role, scope, permission configuration, adapter configuration or event conflicts (or fails authorization/validation first). A different command cannot overwrite an accepted booking. Fresh account resolution, authoritative booking lookup, current permission configuration and current exact membership authorization precede writes, retries and reads. Invalid dependencies/configuration fail closed with typed non-sensitive `FoundationStoreError` codes. The service does not expose its underlying generic stores.

Opt-in `verifyIntegrity` on existing foundation primitives authenticates matching record/revision/audit data and requires durable subreceipt presence. Group receipts now include authenticated copies of subreceipts; opt-in verification rejects changes/deletion. The optional third argument to `transaction.read(principal, targets, { commandId, correlationId })` verifies the encrypted committed group receipt against all record references. Existing defaults and legacy receipt compatibility remain unchanged when integrity verification is not enabled. A snapshot read first retrieves the immutable booking, then verifies both participants and group receipt in a snapshot transaction before returning anything.

## Verification

Final command (strict fixture child environment, no inherited live credentials):

```text
node .claude/elatetrips-specs/specs/031-policy-persistence/checks.mjs src/modules/foundation/policy-snapshot.test.ts src/modules/foundation/persistence.test.ts src/modules/foundation/transaction.test.ts
```

Final result: **108/108 tests passed across four suites**: 37 new policy-snapshot tests and 71 existing persistence/transaction regression tests. Scoped lint passed; whole-source lint checked **254 files, 0 errors, 0 warnings**. Frozen contracts passed **15 schemas / 20 fixtures**. Typecheck and build passed. `evidence/summary.json` and individual logs contain the final machine results.

Focused tests use the existing read-only Mongo 8.2.6 system binary and local memory replica sets; runtime downloads are disabled. The runner supports `--tests-only` for diagnostic iterations and includes whole-source lint status in its exit code. No full application/harness suite is run in this stage; cumulative verification follows sequential 032 integration. A final rerun after typed clock-failure handling and explicit API type exports passed all checks; the earlier 107-test run is retained separately.

Tests cover first commit/read/reopen, encrypted raw storage, exact retry, changed producer content/event/correlation/configuration/permissions/role, conflicting booking/command/event IDs, simultaneous exact/competing/cross-booking event races, canonical/body/event/ownership mismatch, revoked account/membership and foreign scope, immutable caller/return/catalog isolation, failures at every insertion point with full rollback, record/revision/audit/subreceipt/group receipt tampering, missing grants/provenance/configuration and non-sensitive dependency failures. Existing persistence/transaction tests supply regression coverage for changed foundation primitives. Retained raw initial fixture-failure evidence documents the corrected extra-field fixture error.

## Limits and partial backlog coverage

This addresses the durable snapshot portion of DEV-006/008/053/056 only. It does not complete live checkout, booking confirmation/payment, cancellations, refunds, producer binding, global contract adoption, dispatch, DEV006/008/053/056 as a whole, or Gates R1/R2. No provider, live database, deployment, push or main merge is performed. Production adapters, secret management, database append-only permissions and lifecycle migrations remain necessary. Authorization directories/configuration are freshly queried but their revocation is not serialized inside Mongo transactions; this follows the existing foundation boundary. SHA storage IDs are comparison/addressing only; authenticity comes from existing authenticated encryption/HMAC and trusted dependencies.
