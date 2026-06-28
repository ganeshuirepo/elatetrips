import { Schema, model } from 'mongoose';
import type { Order } from './order.types';

const summarySchema = new Schema(
  {
    destination: String,
    dates: String,
    travellers: String,
    transportLabel: String,
    hotelLabel: String,
    packages: [{ _id: false, celeb: String, names: [String] }],
    adventures: [String],
    experiences: [String],
  },
  { _id: false },
);

const orderSchema = new Schema<Order>(
  {
    tripId: { type: String, required: true, unique: true, index: true },
    phone: { type: String, required: true, index: true },
    status: { type: String, enum: ['confirmed', 'cancelled'], default: 'confirmed' },
    total: { type: Number, default: 0 },
    contactName: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    summary: { type: summarySchema, required: true },
  },
  { timestamps: true, versionKey: false },
);

export const OrderModel = model<Order>('Order', orderSchema);
