/**
 * Orders use-case layer (business rules). Sits between the controller and the
 * repository: the controller hands it the caller's phone plus validated input,
 * and it decides what is allowed before any persistence happens.
 *
 * Responsibilities:
 *   - Ownership: every read is scoped to the caller's phone, so one account can
 *     never list or fetch another account's trips.
 *   - Coupon integrity: the discount is recomputed server-side (coupons.ts) and
 *     must match what the client claimed, or the order is rejected.
 *   - Pass-through: the celebration brief (incl. keepSecret) and payment info are
 *     validated at the edge and persisted verbatim — nothing acts on them here.
 * It depends on the IOrderRepository interface, not a concrete DB, so it stays
 * testable and storage-agnostic.
 */
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
    // Everything else in `input` (contact details, celebration brief incl.
    // keepSecret, payment, summary) was validated at the edge and is stored as-is;
    // the repository injects the server-owned fields (phone, tripId, status).
    return this.orders.create(phone, input);
  }

  // Scoped by construction: only ever asks the repository for this phone's trips.
  listMyOrders(phone: string): Promise<Order[]> {
    return this.orders.findByPhone(phone);
  }

  async getMyOrder(phone: string, tripId: string): Promise<Order> {
    // Look up first, then authorise. Distinguishing 404 (no such trip) from 403
    // (exists but not yours) is deliberate: the ownership check is what stops one
    // account reading another's booking by guessing a tripId.
    const order = await this.orders.findByTripId(tripId);
    if (!order) throw new NotFoundError(`Order not found: ${tripId}`);
    if (order.phone !== phone) throw new ForbiddenError('This trip belongs to another account');
    return order;
  }
}
