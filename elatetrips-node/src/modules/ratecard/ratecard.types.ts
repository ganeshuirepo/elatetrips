/**
 * M17 — Rate-Card Ingestion & Price Tolerance: the type surface.
 *
 * Rate rows are EFFECTIVE-DATED and APPEND-ONLY: the `applied` ledger is an
 * immutable history a booking snapshots at booking time (FR17.2). Prices are
 * carried in integer MINOR units + explicit currency, matching the money model
 * used everywhere else on the platform (see /contracts/defs/common.schema.json).
 *
 * Nothing business-valued lives here — slabs, drift window and freshness
 * threshold all arrive as configuration (BR-17, see ratecard.config.ts).
 */

export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED';

/** Money in integer MINOR units (paise/cents) + explicit currency (NFR). */
export interface Money {
  amount: number;
  currency: Currency;
}

/** Provenance of a value inside the partner's owned sheet, for cell-ref notices. */
export interface SheetCellRef {
  sheet: string;
  row: number;
}

/** Where a batch of rows came from. */
export type RateSource = 'sheet' | 'manual_upload' | 'nightly_reconcile';

/**
 * A raw, untrusted row as delivered by a sheet/upload adapter. Every field is
 * optional and unparsed — validateRow() is the only thing that turns it into a
 * NormalizedRow, and invalid rows never land (FR17.1).
 */
export interface RawSheetRow {
  partner_id?: string;
  destination?: string;
  sku?: string;
  price_minor?: number;
  currency?: string;
  effective_from?: string;
  effective_to?: string;
  schema_version?: number;
  /** Cell provenance so a rejection can point the partner at the exact cell. */
  cell: SheetCellRef;
}

/** A validated, typed row ready to diff/apply/stage. */
export interface NormalizedRow {
  partner_id: string;
  destination: string;
  sku: string;
  price: Money;
  effective_from: string;
  effective_to?: string;
  schema_version: number;
  cell: SheetCellRef;
}

export interface RowValidationError {
  cell: SheetCellRef;
  field: string;
  message: string;
}

export type RowValidation =
  | { valid: true; row: NormalizedRow }
  | { valid: false; errors: RowValidationError[] };

/**
 * An applied, effective-dated rate row — a record in the immutable ledger. Once
 * appended it is NEVER mutated; a correction is a new row that supersedes it.
 */
export interface RateRow {
  row_id: string;
  partner_id: string;
  destination: string;
  sku: string;
  price: Money;
  effective_from: string;
  effective_to?: string;
  schema_version: number;
  source: RateSource;
  /** ISO datetime the row was ingested — the clock freshness scoring reads. */
  ingested_ts: string;
  cell?: SheetCellRef;
  /** The applied row this one replaces as the live rate for its SKU, if any. */
  supersedes_row_id?: string;
}

// ---- Tolerance slab evaluation (delta-003 RULE-BAND) -----------------------

/** One ordered price slab. `up_to` is in the SAME money unit as prices (minor). */
export interface ToleranceSlab {
  up_to: number;
  pct: number;
}

/** The tolerance band derived from a baseline (never from the incoming price). */
export interface ToleranceBand {
  baseline_minor: number;
  slab_pct: number;
  lower_minor: number;
  upper_minor: number;
}

export type StageReason = 'beyond_band' | 'cumulative_drift' | 'validation_hold';

export interface ToleranceOutcome {
  decision: 'auto_apply' | 'stage';
  within_band: boolean;
  band: ToleranceBand | null;
  delta_pct: number | null;
  reason?: StageReason;
}

export interface DriftResult {
  breached: boolean;
  /** The window anchor the aggregate drift is measured against, if any. */
  anchor_minor?: number;
  band?: ToleranceBand;
  aggregate_delta_pct?: number;
}

/** The kind of change an incoming row represents against the current baseline. */
export interface RateDiff {
  partner_id: string;
  destination: string;
  sku: string;
  kind: 'new' | 'change' | 'unchanged';
  baseline_minor: number | null;
  incoming_minor: number;
}

/** The pure, combined ingestion decision for a single validated row. */
export interface IngestionDecision {
  action: 'apply' | 'stage';
  diff: RateDiff;
  tolerance: ToleranceOutcome;
  drift: DriftResult;
  reason?: StageReason;
}

// ---- Staged review queue ---------------------------------------------------

/**
 * A proposal that fell outside the auto-apply band (or a cumulative-drift
 * breach). It waits for ops review; approval APPENDS a new applied row (the
 * immutable ledger is never edited in place).
 */
export interface StagedProposal {
  proposal_id: string;
  partner_id: string;
  destination: string;
  sku: string;
  incoming: NormalizedRow;
  baseline_row_id?: string;
  reason: StageReason;
  tolerance: ToleranceOutcome;
  drift: DriftResult;
  status: 'pending' | 'approved' | 'rejected';
  created_ts: string;
  resolved_ts?: string;
  resolved_by?: string;
  resolved_note?: string;
}

// ---- Freshness (FR17.2) ----------------------------------------------------

export interface FreshnessResult {
  partner_id: string;
  /** Days since the last fresh (applied) row; null when the partner has none. */
  score_days: number | null;
  last_fresh_ts: string | null;
  threshold_days: number | null;
  /** True when scoring is configured AND the partner is within threshold. */
  fresh: boolean;
  /** True when scoring is configured AND threshold is breached (suspend pool). */
  stale: boolean;
}

// ---- Ingestion result envelope ---------------------------------------------

export interface IngestSummary {
  partner_id: string;
  applied: RateRow[];
  staged: StagedProposal[];
  rejected: { cell: SheetCellRef; errors: RowValidationError[] }[];
}

// ---- Audit (BR-6) ----------------------------------------------------------

/**
 * Local M17 event vocabulary. These mirror the frozen events.md envelope but
 * are NOT yet in the catalog — formalizing them (and reusing `pool.member_stale`
 * for M19 suspension) is a /contracts change requiring a delta. Kept module-local
 * so this feature ships without editing the frozen contract surface.
 */
export type RatecardEventType =
  | 'ratecard.row_applied'
  | 'ratecard.row_staged'
  | 'ratecard.row_rejected'
  | 'ratecard.staged_approved'
  | 'ratecard.staged_rejected'
  | 'ratecard.drift_flagged'
  | 'ratecard.partner_stale'
  | 'ratecard.snapshot_taken';

export type RatecardActor = 'system' | 'ops' | 'supplier';
export type RatecardRole = 'platform' | 'ops' | 'dmc' | 'hotel' | 'provider';

export interface RatecardAuditEvent {
  event_id: string;
  type: RatecardEventType;
  actor: RatecardActor;
  actor_id: string;
  role: RatecardRole;
  ts: string;
  subject: {
    partner_id?: string;
    sku?: string;
    row_id?: string;
    proposal_id?: string;
    booking_id?: string;
  };
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  payload: Record<string, unknown>;
}
