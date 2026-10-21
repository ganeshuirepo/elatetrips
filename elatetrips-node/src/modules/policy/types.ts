/** Canonical fields mirror frozen contracts/policy.schema.json; tenant is NOT a policy field. */
export type PolicyScope = 'platform_default' | 'partner' | 'quote';
export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED';
export interface Money { readonly amount: number; readonly currency: Currency }
export interface RefundBand { readonly days_before: number; readonly refund_pct: number }
export interface PeakOverride {
  readonly from: string;
  readonly to: string;
  readonly refund_bands: readonly RefundBand[];
}
export interface Policy {
  readonly policy_id: string;
  readonly version: number;
  readonly scope: PolicyScope;
  readonly partner_id?: string;
  readonly quote_id?: string;
  readonly effective_from: string;
  readonly effective_to?: string;
  readonly booking_terms?: { readonly deposit_pct?: number; readonly balance_due_days_before?: number };
  readonly refund_bands: readonly RefundBand[];
  readonly peak_overrides?: readonly PeakOverride[];
  readonly flexibility_score?: number;
}
/** Internal catalog owner binding; populated by a future authenticated repository adapter. */
export interface OwnedPolicy { readonly tenant_id: string; readonly policy: Policy }
export interface PolicyContext {
  readonly tenant_id: string;
  readonly partner_id: string;
  readonly quote_id: string;
  readonly business_date: string;
}
export interface ResolutionConfig {
  readonly version: string;
  /** Ordered from most specific to least specific: quote, partner, platform_default. */
  readonly scopes: readonly PolicyScope[];
  readonly fallback: 'allow' | 'deny';
  readonly effective_to: 'inclusive' | 'exclusive';
}
export interface EstimationConfig {
  readonly version: string;
  readonly rounding: 'floor' | 'ceil' | 'half_up' | 'half_even';
  readonly percentage_basis: 'accepted' | 'captured';
  readonly peak_basis: 'trip_start_date' | 'cancellation_date';
  readonly peak_end: 'inclusive' | 'exclusive';
}
export interface PolicySelection {
  readonly owner: OwnedPolicy;
  readonly context: PolicyContext;
  readonly resolution: ResolutionConfig;
}
export type Actor = 'customer' | 'ops' | 'supplier' | 'system' | 'ai';
export type Role = 'customer' | 'dmc' | 'hotel' | 'provider' | 'ops' | 'platform';
export interface AuditInput {
  readonly command_id: string;
  readonly event_id: string;
  readonly actor: Actor;
  readonly actor_id: string;
  readonly role: Role;
  readonly ts: string;
}
/** Internal JSON snapshot; the contained policy retains the canonical contract shape. */
export interface PolicySnapshot {
  readonly schema_version: 1;
  readonly tenant_id: string;
  readonly booking_id: string;
  readonly rfq_id: string;
  readonly quote_id: string;
  readonly partner_id: string;
  readonly business_date: string;
  readonly trip_start_date: string;
  readonly accepted_amount: Money;
  readonly policy: Policy;
  readonly resolution: ResolutionConfig;
  readonly estimation: EstimationConfig | null;
}
/** Envelope and payload from contracts/events.md; this event has NOT been committed. */
export interface PolicySnapshotEvent {
  readonly event_id: string;
  readonly type: 'policy.snapshotted';
  readonly actor: Actor;
  readonly actor_id: string;
  readonly role: Role;
  readonly ts: string;
  readonly subject: { readonly rfq_id: string; readonly quote_id: string; readonly booking_id: string };
  readonly before: null;
  readonly after: { readonly policy_snapshot: PolicySnapshot };
  readonly payload: { readonly booking_id: string; readonly policy_id: string; readonly version: number };
}
export interface SnapshotProposal {
  readonly kind: 'policy_snapshot_proposal';
  readonly command_id: string;
  /** SHA-256 over canonical snapshot + audit + command; advisory retry evidence, not persistence. */
  readonly fingerprint: string;
  readonly snapshot: PolicySnapshot;
  readonly event: PolicySnapshotEvent;
}
export interface RefundEstimate {
  readonly kind: 'refund_estimate';
  readonly booking_id: string;
  readonly policy_id: string;
  readonly policy_version: number;
  readonly configuration_version: string;
  readonly cancellation_date: string;
  readonly trip_start_date: string;
  readonly days_before: number;
  readonly source: 'base' | 'peak';
  readonly band: RefundBand;
  readonly percentage_basis: Money;
  readonly captured_amount: Money;
  readonly refund: Money;
  readonly capped: boolean;
}
export type Outcome<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'invalid'; readonly issues: readonly string[] }
  | { readonly status: 'unavailable'; readonly reason: string }
  | { readonly status: 'ambiguous'; readonly reason: string };
