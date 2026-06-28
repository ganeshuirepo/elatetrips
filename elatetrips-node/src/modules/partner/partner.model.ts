import { Schema, model } from 'mongoose';
import type { PartnerEoi } from './partner.types';

const propertySchema = new Schema(
  {
    hotelName: { type: String, required: true },
    city: { type: String, default: '' },
    category: { type: String, default: '' },
    totalRooms: { type: String, default: '' },
    contactName: { type: String, required: true },
    role: { type: String, default: '' },
    email: { type: String, required: true, index: true },
    phone: { type: String, required: true },
  },
  { _id: false },
);

const serviceSchema = new Schema(
  {
    service: { type: String, required: true },
    packages: { type: [String], default: undefined },
    fulfilment: { type: String, default: '' },
    leadTime: { type: String, default: '' },
    priceRange: { type: String, default: '' },
    capacityPerDay: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { _id: false },
);

const surpriseSchema = new Schema(
  {
    capable: { type: String, default: '' },
    setupWindow: { type: String, default: '' },
    photoProof: { type: String, default: '' },
  },
  { _id: false },
);

const inventorySchema = new Schema(
  {
    updateMethod: { type: String, default: '' },
    channelManagerOrPMS: { type: String, default: '' },
    updateFrequency: { type: String, default: '' },
    liveAvailability: { type: String, default: '' },
    roomsAllocated: { type: String, default: '' },
    rateModel: { type: String, default: '' },
    confirmationSLA: { type: String, default: '' },
  },
  { _id: false },
);

const partnerEoiSchema = new Schema<PartnerEoi>(
  {
    referenceId: { type: String, required: true, unique: true, index: true },
    property: { type: propertySchema, required: true },
    services: { type: [serviceSchema], default: [] },
    surprise: { type: surpriseSchema, default: {} },
    inventory: { type: inventorySchema, default: {} },
    notes: { type: String, default: '' },
    consent: { type: Boolean, default: false },
  },
  // Explicit collection name as requested: partner submissions live in `partner_eoi`.
  { timestamps: true, versionKey: false, collection: 'partner_eoi' },
);

export const PartnerEoiModel = model<PartnerEoi>('PartnerEoi', partnerEoiSchema);
