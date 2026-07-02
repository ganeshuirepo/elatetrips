import type { IOrderRepository } from './order.repository';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../common/errors/AppError';
import { couponDiscount } from './coupons';
import type { Order, CreateOrderInput } from './order.types';

/**
 * Order use cases. Enforces ownership — a user can only read the trips booked
 * under their own mobile number — keeping authorisation logic in one place.
 */
export class OrderService {
  constructor(private readonly orders: IOrderRepository) {}

  createOrder(phone: string, input: CreateOrderInput): Promise<Order> {
    // Recompute the coupon server-side so a tampered client can't invent
    // discounts. `total` arrives net; gross = net + claimed discount.
    const claimed = input.discount ?? 0;
    const expected = input.coupon ? couponDiscount(input.coupon, input.total + claimed) : 0;
    if (claimed !== expected) {
      throw new BadRequestError('Coupon discount does not match the order total');
    }
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
