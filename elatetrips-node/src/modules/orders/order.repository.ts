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

const projection = '-_id -__v';

export class OrderRepository implements IOrderRepository {
  /** Build the next unique trip id, e.g. "ELT-100001". */
  private async nextTripId(): Promise<string> {
    const seq = await nextSequence('order');
    return `ELT-${100000 + seq}`;
  }

  async create(phone: string, input: CreateOrderInput): Promise<Order> {
    const tripId = await this.nextTripId();
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

/* eslint-disable @typescript-eslint/no-explicit-any */
function stripId(_doc: any, ret: any): any {
  delete ret._id;
  return ret;
}
