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
    items: [{ _id: false, label: String, detail: String, qty: Number, amount: Number }],
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
    // Additive with defaults: elatetrips-node is shared, so older documents
    // and the other apps' writes stay valid without a migration.
    celebration: {
      type: new Schema(
        {
          occasionDate: { type: String, default: '' },
          cakeMessage: { type: String, default: '' },
          dietary: { type: String, default: '' },
          notes: { type: String, default: '' },
          keepSecret: { type: Boolean, default: false },
        },
        { _id: false },
      ),
      required: false,
    },
    coupon: { type: String, default: '' },
    discount: { type: Number, default: 0 },
    payment: {
      type: new Schema(
        { method: String, txnId: String, status: String },
        { _id: false },
      ),
      required: false,
    },
    summary: { type: summarySchema, required: true },
  },
  { timestamps: true, versionKey: false },
);

export const OrderModel = model<Order>('Order', orderSchema);
