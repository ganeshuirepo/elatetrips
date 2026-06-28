import type { IOrderRepository } from './order.repository';
import { NotFoundError, ForbiddenError } from '../../common/errors/AppError';
import type { Order, CreateOrderInput } from './order.types';

/**
 * Order use cases. Enforces ownership — a user can only read the trips booked
 * under their own mobile number — keeping authorisation logic in one place.
 */
export class OrderService {
  constructor(private readonly orders: IOrderRepository) {}

  createOrder(phone: string, input: CreateOrderInput): Promise<Order> {
    return this.orders.create(phone, input);
  }

  listMyOrders(phone: string): Promise<Order[]> {
    return this.orders.findByPhone(phone);
  }

  async getMyOrder(phone: string, tripId: string): Promise<Order> {
    const order = await this.orders.findByTripId(tripId);
    if (!order) throw new NotFoundError(`Order not found: ${tripId}`);
    if (order.phone !== phone) throw new ForbiddenError('This trip belongs to another account');
    return order;
  }
}
