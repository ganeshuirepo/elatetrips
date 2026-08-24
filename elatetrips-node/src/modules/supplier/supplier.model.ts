import { Schema, model } from 'mongoose';
import type { Supplier } from './supplier.types';

/*
 * Supplier collection (M3). Unlike the read-only catalog reference data, this
 * collection is written at runtime (onboarding, tiering, e-acceptance), so the
 * schema is richer. The business key is `supplier_id` (the contract id); `_id`
 * and `__v` are hidden by the repository projection so responses match the DTO.
 *
 * Indexes back the two hot queries: the public directory listing and the M5/M12
 * candidate query, both of which filter by destination + track + tier + status.
 */
const opts = { versionKey: false } as const;

const contactSchema = new Schema(
  {
    role: { type: String, required: true },
    name: { type: String, required: true },
    email: String,
    phone: String,
    otp_verified: { type: Boolean, default: false },
  },
  { _id: false },
);

const vettingSchema = new Schema(
  {
    registered_entity: Boolean,
    gstin: String,
    tourism_registration: String,
    liability_insurance: Boolean,
    emergency_protocol: Boolean,
    references_count: Number,
    sample_reviewed: Boolean,
    rate_card_ref: String,
  },
  { _id: false },
);

const acceptanceSchema = new Schema(
  {
    version: { type: String, required: true },
    content_hash: { type: String, required: true },
    accepted_ts: { type: String, required: true },
    ip: { type: String, required: true },
    signatory_name: { type: String, required: true },
    signatory_role: { type: String, required: true },
  },
  { _id: false },
);

const supplierSchema = new Schema<Supplier>(
  {
    supplier_id: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true, index: true },
    name: { type: String, required: true },
    destinations: { type: [String], default: [], index: true },
    track: { type: String, required: true, enum: ['A', 'B'], index: true },
    tier: { type: String, enum: ['primary', 'bench', 'reserve'], index: true },
    declared_tat_hours: { type: Number, required: true },
    contract_accepted: { type: Boolean, default: false },
    comms_consent: {
      type: { sms: Boolean, email: Boolean, whatsapp: Boolean, voice: Boolean },
      default: undefined,
      _id: false,
    },

    status: {
      type: String,
      required: true,
      enum: ['invited', 'vetting', 'active', 'bench', 'probation', 'paused'],
      default: 'invited',
      index: true,
    },
    quality_tier: { type: String, enum: ['preferred', 'standard', 'probation'] },
    contacts: { type: [contactSchema], default: undefined },
    channel_pref: { type: String, enum: ['email', 'whatsapp'], default: 'email' },
    vetting: { type: vettingSchema, default: undefined },
    contract_acceptance: { type: acceptanceSchema, default: undefined },
    scorecard: {
      type: { rank: Number, fairness_debt: Number },
      default: undefined,
      _id: false,
    },
    created_ts: String,
    updated_ts: String,
  },
  opts,
);

export const SupplierModel = model<Supplier>('Supplier', supplierSchema);
