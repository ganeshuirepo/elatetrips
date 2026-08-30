/**
 * M17 rate-card persistence — the two collections behind IRateRowRepository.
 *
 * They are deliberately different in kind:
 *
 *  - `ratecard_rows` is the APPEND-ONLY applied ledger (FR17.2). A booking
 *    snapshots a row at booking time and must be able to trust that the row it
 *    read never changes, so a correction is a NEW row carrying
 *    `supersedes_row_id` — never an edit. Nothing in the repository exposes an
 *    update or delete for this collection; that omission is the invariant.
 *  - `ratecard_staged` is a MUTABLE review queue (pending → approved/rejected).
 *    Approving a proposal appends to the ledger; it does not edit it.
 *
 * `_id`/`__v` are projected away by the repository so documents come back as the
 * exact domain types in ratecard.types.ts, the same shapes the in-memory
 * implementation returns.
 */
import { Schema, model } from 'mongoose';
import type { RateRow, StagedProposal } from './ratecard.types';

const opts = { versionKey: false } as const;

/** Money stays {minor amount + currency} — never a bare number (NFR). */
const moneySchema = new Schema(
  {
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
  },
  { _id: false },
);

/** Cell provenance, so a rejection can point the partner at the exact cell. */
const cellSchema = new Schema(
  {
    sheet: { type: String, required: true },
    row: { type: Number, required: true },
  },
  { _id: false },
);

const rateRowSchema = new Schema<RateRow>(
  {
    row_id: { type: String, required: true, unique: true, index: true },
    partner_id: { type: String, required: true },
    destination: { type: String, required: true },
    sku: { type: String, required: true },
    price: { type: moneySchema, required: true },
    effective_from: { type: String, required: true },
    effective_to: String,
    schema_version: { type: Number, required: true },
    source: { type: String, required: true },
    ingested_ts: { type: String, required: true },
    cell: cellSchema,
    supersedes_row_id: String,
  },
  opts,
);

// The baseline lookup (latest applied row for a SKU) and the booking-time
// effective-date lookup are the hot reads; both filter partner+sku and order by
// ingestion. lastFreshRow drops the sku and wants the newest first.
rateRowSchema.index({ partner_id: 1, sku: 1, ingested_ts: 1 });
rateRowSchema.index({ partner_id: 1, ingested_ts: -1 });

const bandSchema = new Schema(
  {
    baseline_minor: { type: Number, required: true },
    slab_pct: { type: Number, required: true },
    lower_minor: { type: Number, required: true },
    upper_minor: { type: Number, required: true },
  },
  { _id: false },
);

// `band` and `delta_pct` are genuinely nullable — "no baseline existed to build a
// band from" is a different fact than "the field was never written", and the
// review queue shows the difference. Stored as null rather than omitted.
const toleranceSchema = new Schema(
  {
    decision: { type: String, required: true },
    within_band: { type: Boolean, required: true },
    band: { type: bandSchema, default: null },
    delta_pct: { type: Number, default: null },
    reason: String,
  },
  { _id: false },
);

const driftSchema = new Schema(
  {
    breached: { type: Boolean, required: true },
    anchor_minor: Number,
    band: bandSchema,
    aggregate_delta_pct: Number,
  },
  { _id: false },
);

/** The incoming row as validated — kept whole so review sees what was proposed. */
const normalizedRowSchema = new Schema(
  {
    partner_id: { type: String, required: true },
    destination: { type: String, required: true },
    sku: { type: String, required: true },
    price: { type: moneySchema, required: true },
    effective_from: { type: String, required: true },
    effective_to: String,
    schema_version: { type: Number, required: true },
    cell: { type: cellSchema, required: true },
  },
  { _id: false },
);

const stagedProposalSchema = new Schema<StagedProposal>(
  {
    proposal_id: { type: String, required: true, unique: true, index: true },
    partner_id: { type: String, required: true },
    destination: { type: String, required: true },
    sku: { type: String, required: true },
    incoming: { type: normalizedRowSchema, required: true },
    baseline_row_id: String,
    reason: { type: String, required: true },
    tolerance: { type: toleranceSchema, required: true },
    drift: { type: driftSchema, required: true },
    status: { type: String, required: true, enum: ['pending', 'approved', 'rejected'] },
    created_ts: { type: String, required: true },
    resolved_ts: String,
    resolved_by: String,
    resolved_note: String,
  },
  opts,
);

// The ops queue is read as "everything still pending", optionally narrowed to
// one partner — the order the index is built in.
stagedProposalSchema.index({ status: 1, partner_id: 1, created_ts: 1 });

export const RateRowModel = model<RateRow>('RatecardRow', rateRowSchema, 'ratecard_rows');
export const StagedProposalModel = model<StagedProposal>(
  'RatecardStagedProposal',
  stagedProposalSchema,
  'ratecard_staged',
);
