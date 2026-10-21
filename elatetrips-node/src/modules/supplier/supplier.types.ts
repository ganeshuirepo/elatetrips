/**
 * Supplier module DTOs (M3 — Supplier Directory, Onboarding, Tiering & Cap Policy).
 *
 * The PERSISTED record is a superset of the frozen `supplier.schema.json`: it
 * carries the contract fields verbatim (so the record projects cleanly onto the
 * public `GET /api/v1/suppliers` contract view) plus the onboarding, vetting,
 * tiering and e-acceptance state M3 owns. Anything the contract does not know
 * about (quality tier, status, vetting artifacts, per-role contacts, scorecard
 * inputs) lives only on the internal record and is never leaked into a
 * contract-shaped response — see `toContractView` in the service.
 */

/*
 * Each closed set is declared once as a frozen array and the union derived from
 * it, so supplier.model.ts can use the SAME array as its schema enum. One
 * definition, not two that agree today.
 */

/** Contract enum — DMC route (A) vs direct-hotel route (B). BR-10/BR-11. */
export const TRACKS = ['A', 'B'] as const;
export type Track = (typeof TRACKS)[number];

/** Contract enum — supplier entity type. */
export const SUPPLIER_TYPES = ['dmc', 'hotel', 'adventure', 'experience', 'transport'] as const;
export type SupplierType = (typeof SUPPLIER_TYPES)[number];

/**
 * Contract `tier` — the CAP SLOT a supplier occupies per destination (FR3.3):
 * primary (a capped active slot), bench (vetted, inactive reserve), reserve
 * (uncapped direct-hotel roster / provider pool). Distinct from `quality_tier`.
 */
export const CAP_TIERS = ['primary', 'bench', 'reserve'] as const;
export type CapTier = (typeof CAP_TIERS)[number];

/**
 * FR3.4 tiering — Preferred | Standard | Probation, driven by the M10 scorecard.
 * Affects wave ordering and enrichment eligibility, NEVER inclusion (fairness
 * floor, M5 FR5.2). Internal only; not part of the frozen contract projection.
 */
export const QUALITY_TIERS = ['preferred', 'standard', 'probation'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

/** FR3.7 lifecycle status. */
export const SUPPLIER_STATUSES = [
  'invited',
  'vetting',
  'active',
  'bench',
  'probation',
  'paused',
] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

/** Contract comms-consent block (BR-2 gates WhatsApp; FR3.10 gates voice). */
export interface CommsConsent {
  sms?: boolean;
  email?: boolean;
  whatsapp?: boolean;
  voice?: boolean;
}

/** Which job a contact does — routing depends on it (quotes to the quoter). */
export const CHANNEL_PREFS = ['email', 'whatsapp'] as const;
export type ChannelPref = (typeof CHANNEL_PREFS)[number];

export const CONTACT_ROLES = ['owner', 'quoter', 'banquet_sales', 'emergency'] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

/** FR3.7 role-specific contact. `otp_verified` gates commit actions (BR-15). */
export interface SupplierContact {
  role: ContactRole;
  name: string;
  email?: string;
  phone?: string;
  /** OTP-verified at onboarding so later commit actions bind to them (FR3.11). */
  otp_verified: boolean;
}

/**
 * FR3.5 vetting artifacts. Activation is blocked until every REQUIRED artifact
 * for the track is present (see `service.assertVettingComplete`). Which artifacts
 * are required is policy (BR-17), not hard-coded here.
 */
export interface VettingArtifacts {
  registered_entity?: boolean;
  gstin?: string;
  tourism_registration?: string;
  liability_insurance?: boolean;
  /** Named 24×7 emergency contact + escalation protocol present. */
  emergency_protocol?: boolean;
  /** Two business references supplied. */
  references_count?: number;
  /** One sample itinerary/voucher reviewed. */
  sample_reviewed?: boolean;
  /** Track B only — celebration/decor rate card on file. */
  rate_card_ref?: string;
}

/**
 * FR3.10 e-acceptance (clickwrap) record. Stores exactly what the FR requires:
 * contract version, content hash, timestamp, IP, signatory name and role. The
 * contract CONTENT is data supplied elsewhere; this is only the acceptance proof.
 */
export interface ContractAcceptance {
  version: string;
  content_hash: string;
  accepted_ts: string;
  ip: string;
  signatory_name: string;
  signatory_role: string;
}

/** Scorecard inputs consumed from M10 (nullable until M10 lands — FR3.8). */
export interface ScorecardRef {
  /** Deterministic rank within the destination/track; lower is better. */
  rank?: number | null;
  /** Fairness-debt counter (higher = owed a turn) — M5 rotation input. */
  fairness_debt?: number | null;
}

/**
 * The internal, persisted supplier record. A superset of `supplier.schema.json`.
 * `declared_tat_hours` is the contract's single canonical TAT (a supplier sits on
 * one track, so its declared turnaround is that track's — FR3.9).
 */
export interface Supplier {
  // ---- Frozen contract surface (supplier.schema.json) ----------------------
  supplier_id: string;
  type: SupplierType;
  name: string;
  destinations: string[];
  track: Track;
  tier?: CapTier;
  declared_tat_hours: number;
  contract_accepted: boolean;
  comms_consent?: CommsConsent;

  // ---- M3-owned onboarding / tiering state (NOT in the contract view) -------
  status: SupplierStatus;
  quality_tier?: QualityTier;
  contacts?: SupplierContact[];
  channel_pref?: ChannelPref;
  vetting?: VettingArtifacts;
  /** The accepted contract; absent until the clickwrap step (FR3.10). */
  contract_acceptance?: ContractAcceptance;
  scorecard?: ScorecardRef;
  /**
   * The id this partner carries in the system that onboarded them — the partner
   * portal's `Vendor.leadId`. It is what makes provisioning idempotent: a
   * registration that is submitted twice, or retried after a timeout, resolves
   * to the SAME supplier rather than a second one. Unique where present; absent
   * on suppliers ops added directly.
   */
  external_ref?: string;
  created_ts?: string;
  updated_ts?: string;
}

/** The contract-shaped projection returned by `GET /api/v1/suppliers`. */
export interface SupplierContractView {
  supplier_id: string;
  type: SupplierType;
  name: string;
  destinations: string[];
  track: Track;
  tier?: CapTier;
  declared_tat_hours: number;
  contract_accepted: boolean;
  comms_consent?: CommsConsent;
}

/** Body to invite/create a supplier (onboarding start — FR3.1/FR3.11). */
export interface CreateSupplierInput {
  supplier_id: string;
  type: SupplierType;
  name: string;
  destinations: string[];
  track: Track;
  declared_tat_hours: number;
  channel_pref?: 'email' | 'whatsapp';
  comms_consent?: CommsConsent;
  contacts?: SupplierContact[];
  vetting?: VettingArtifacts;
}

/**
 * Body to provision a supplier from a completed partner registration.
 *
 * Unlike CreateSupplierInput there is no `supplier_id`: the platform mints it,
 * because the whole point is to establish ONE canonical partner identity rather
 * than let each caller invent its own. `external_ref` is the caller's own id for
 * the same partner, and is what makes the call idempotent.
 */
export interface ProvisionPartnerInput {
  external_ref: string;
  type: SupplierType;
  name: string;
  destinations: string[];
  track: Track;
  declared_tat_hours: number;
  channel_pref?: 'email' | 'whatsapp';
  comms_consent?: CommsConsent;
  contacts?: SupplierContact[];
}

/** What provisioning returns — and whether this call is what created it. */
export interface ProvisionResult {
  supplier: SupplierContractView;
  /** False when an existing supplier was matched on `external_ref`. */
  created: boolean;
}

/** Partial patch for manual add/edit (FR3.1). */
export type UpdateSupplierInput = Partial<
  Omit<CreateSupplierInput, 'supplier_id'>
> & { quality_tier?: QualityTier; scorecard?: ScorecardRef };

/** FR3.8 candidate-query parameters for M5/M12. */
export interface CandidateQuery {
  destination: string;
  track?: Track;
  tier?: CapTier;
  status?: SupplierStatus;
  /** Filter out suppliers whose accepted contract predates this version
   *  (material change → re-acceptance required before RFQ delivery, FR3.10). */
  current_contract_version?: string;
}

/** FR3.8 read-API row: contract view + the routing inputs M5 needs. */
export interface CandidateRow extends SupplierContractView {
  status: SupplierStatus;
  quality_tier?: QualityTier;
  scorecard_rank: number | null;
  fairness_debt: number | null;
  /** True when a material contract version bump blocks RFQ delivery (FR3.10). */
  reacceptance_required: boolean;
}

/** Outcome of the cap policy check (FR3.3). */
export type CapDecision =
  | { outcome: 'accept'; slot: 'primary' }
  | { outcome: 'bench'; slot: 'bench'; reason: string; primary_count: number; cap: number }
  | { outcome: 'uncapped'; slot: 'reserve' };
