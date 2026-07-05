import { Schema, model } from 'mongoose';
import { PARTNER_TYPES } from './partner.types';
import type { PartnerEoi } from './partner.types';

const businessSchema = new Schema(
  {
    businessName: { type: String, required: true },
    city: { type: String, default: '' },
    contactName: { type: String, default: '' },
    role: { type: String, default: '' },
    email: { type: String, required: true, index: true },
    phone: { type: String, required: true },
  },
  { _id: false },
);

const portfolioItemSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    priceRange: { type: String, default: '' },
    link: { type: String, default: '' },
  },
  { _id: false },
);

const partnerEoiSchema = new Schema<PartnerEoi>(
  {
    referenceId: { type: String, required: true, unique: true, index: true },
    partnerType: { type: String, enum: PARTNER_TYPES, required: true, index: true },
    business: { type: businessSchema, required: true },
    // Template answers vary per track and evolve with the frontend templates,
    // so they are stored schemaless (validated at the edge by zod).
    details: { type: Schema.Types.Mixed, default: {} },
    portfolio: { type: [portfolioItemSchema], default: [] },
    notes: { type: String, default: '' },
    consent: { type: Boolean, default: false },
  },
  // Explicit collection name as requested: partner submissions live in `partner_eoi`.
  { timestamps: true, versionKey: false, collection: 'partner_eoi' },
);

export const PartnerEoiModel = model<PartnerEoi>('PartnerEoi', partnerEoiSchema);
