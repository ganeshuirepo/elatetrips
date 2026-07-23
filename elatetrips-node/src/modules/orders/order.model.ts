/**
 * Mongoose schema for the `orders` collection — the on-disk shape of an Order.
 *
 * elatetrips-node is a SHARED backend (elatetrips and this Experiences app both
 * write here), so fields are additive with safe defaults and nothing is required
 * unless every writer supplies it. That lets new fields (celebration, payment)
 * land without migrating existing documents.
 *
 * tripId is the unique public key (indexed, looked up in getMyOrder); phone is
 * the account key (indexed, used to list a user's trips). timestamps:true adds
 * the createdAt used to sort "My orders" newest-first.
 */
import { Schema, model } from 'mongoose';
import type { Order } from './order.types';

// Embedded, display-ready snapshot of the booked plan. _id:false on the subdocs
// because these lines are shown as a group, never addressed individually.
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
    // Constrained to the two lifecycle states; the repository always writes
    // 'confirmed' on create, so the client can't set an arbitrary status.
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
          // keepSecret: the surprise must not reach the person being celebrated
          // (a fulfilment instruction for staff; the server stores it, doesn't act on it).
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
