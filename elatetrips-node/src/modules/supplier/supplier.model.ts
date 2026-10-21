import { Schema, model } from 'mongoose';
import {
  CAP_TIERS,
  CHANNEL_PREFS,
  CONTACT_ROLES,
  QUALITY_TIERS,
  SUPPLIER_STATUSES,
  SUPPLIER_TYPES,
  TRACKS,
} from './supplier.types';
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
    // Routing reads this — a quote request goes to the quoter, an incident to
    // the emergency contact — so an unrecognised role is a message nobody gets.
    role: { type: String, required: true, enum: CONTACT_ROLES },
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
    // The one closed set on this schema that was left open. It drives the audit
    // role and the M5/M12 candidate query, so an unknown value here quietly
    // removes a supplier from every broadcast it should have been in.
    type: { type: String, required: true, enum: SUPPLIER_TYPES, index: true },
    name: { type: String, required: true },
    destinations: { type: [String], default: [], index: true },
    track: { type: String, required: true, enum: TRACKS, index: true },
    tier: { type: String, enum: CAP_TIERS, index: true },
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
      enum: SUPPLIER_STATUSES,
      default: 'invited',
      index: true,
    },
    quality_tier: { type: String, enum: QUALITY_TIERS },
    contacts: { type: [contactSchema], default: undefined },
    channel_pref: { type: String, enum: CHANNEL_PREFS, default: 'email' },
    vetting: { type: vettingSchema, default: undefined },
    contract_acceptance: { type: acceptanceSchema, default: undefined },
    scorecard: {
      type: { rank: Number, fairness_debt: Number },
      default: undefined,
      _id: false,
    },
    // The onboarding system's own id for this partner. `sparse` because most
    // suppliers have none (ops added them directly) and a plain unique index
    // would then collide on the second such row — every missing value would
    // count as the same null. Together with the unique constraint this is what
    // makes provisioning idempotent under retries and races.
    external_ref: { type: String, unique: true, sparse: true },
    created_ts: String,
    updated_ts: String,
  },
  opts,
);

export const SupplierModel = model<Supplier>('Supplier', supplierSchema);
