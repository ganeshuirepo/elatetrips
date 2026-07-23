/**
 * Orders persistence (Mongoose). The only layer that talks to MongoDB; the
 * service depends on the IOrderRepository interface below, so the store can be
 * mocked in tests or swapped without touching business logic.
 *
 * Read paths return plain objects via .lean() with Mongo's internal _id/__v
 * stripped (the `projection` string), and create() applies the same strip via a
 * toObject transform — so both paths hand upward the clean Order domain shape.
 */
import { OrderModel } from './order.model';
import { nextSequence } from './counter.model';
import type { Order, CreateOrderInput } from './order.types';

/** Persistence contract for orders. */
export interface IOrderRepository {
  /** Persist a new order for `phone`, assigning a unique trip id. */
  create(phone: string, input: CreateOrderInput): Promise<Order>;
  findByPhone(phone: string): Promise<Order[]>;
  findByTripId(tripId: string): Promise<Order | null>;
}

// Excludes Mongo's internal _id/__v from read queries (find/findOne).
const projection = '-_id -__v';

export class OrderRepository implements IOrderRepository {
  /** Build the next unique trip id, e.g. "ELT-100001". */
  private async nextTripId(): Promise<string> {
    // nextSequence atomically increments the shared "order" counter (starts at 1),
    // so concurrent bookings can never receive the same number. +100000 turns it
    // into a friendly 6-digit id: first order -> ELT-100001, next -> ELT-100002.
    const seq = await nextSequence('order');
    return `ELT-${100000 + seq}`;
  }

  async create(phone: string, input: CreateOrderInput): Promise<Order> {
    const tripId = await this.nextTripId();
    // phone (owner) and tripId are assigned here, and status is forced to
    // 'confirmed' — these are never trusted from the client's input.
    const doc = await OrderModel.create({ ...input, phone, tripId, status: 'confirmed' });
    return doc.toObject({ versionKey: false, transform: stripId });
  }

  async findByPhone(phone: string): Promise<Order[]> {
    return OrderModel.find({ phone }).sort({ createdAt: -1 }).select(projection).lean<Order[]>().exec();
  }

  async findByTripId(tripId: string): Promise<Order | null> {
    return OrderModel.findOne({ tripId }).select(projection).lean<Order>().exec();
  }
}

// toObject transform used by create(): drops Mongo's _id from the returned
// document, mirroring `projection` on the read paths so every method yields the
// same clean Order shape. (any-typed because Mongoose's transform signature is.)
/* eslint-disable @typescript-eslint/no-explicit-any */
function stripId(_doc: any, ret: any): any {
  delete ret._id;
  return ret;
}
