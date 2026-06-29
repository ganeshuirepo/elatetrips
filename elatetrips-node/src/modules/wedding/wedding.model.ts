import { Schema, model } from 'mongoose';
import type { WeddingEnquiry } from './wedding.types';

const contactSchema = new Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: '' },
  },
  { _id: false },
);

const ceremonySchema = new Schema(
  {
    type: { type: String, required: true },
    date: { type: String, default: '' },
  },
  { _id: false },
);

const weddingEnquirySchema = new Schema<WeddingEnquiry>(
  {
    referenceId: { type: String, required: true, unique: true, index: true },
    contact: { type: contactSchema, required: true },
    weddingGuests: { type: String, default: '' },
    preCeremonies: { type: [ceremonySchema], default: [] },
    postCeremonies: { type: [ceremonySchema], default: [] },
    services: { type: [String], default: [] },
    weddingDate: { type: String, default: '' },
    preferredHotels: { type: String, default: '' },
    destination: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  // Explicit collection: wedding leads live in `wedding_enquiry`.
  { timestamps: true, versionKey: false, collection: 'wedding_enquiry' },
);

export const WeddingEnquiryModel = model<WeddingEnquiry>('WeddingEnquiry', weddingEnquirySchema);
