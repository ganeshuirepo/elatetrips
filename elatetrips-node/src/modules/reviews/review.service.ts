import type { IReviewRepository } from './review.repository';
import type { IOrderRepository } from '../orders/order.repository';
import type { IUserRepository } from '../users/user.repository';
import type { IHotelRepository } from '../catalog/hotel.repository';
import { ForbiddenError, NotFoundError } from '../../common/errors/AppError';
import type { CreateReviewInput, HotelReview } from './review.types';

/**
 * Guest reviews with a booked-only write rule: a guest may review a hotel only
 * if one of their confirmed orders includes that hotel. Reads are public.
 */
export class ReviewService {
  constructor(
    private readonly reviews: IReviewRepository,
    private readonly orders: IOrderRepository,
    private readonly users: IUserRepository,
    private readonly hotels: IHotelRepository,
  ) {}

  async list(hotelId: string): Promise<HotelReview[]> {
    return this.reviews.listByHotel(hotelId);
  }

  async add(phone: string, hotelId: string, input: CreateReviewInput): Promise<HotelReview> {
    const hotel = await this.hotels.findById(hotelId);
    if (!hotel) throw new NotFoundError(`Hotel not found: ${hotelId}`);

    const orders = await this.orders.findByPhone(phone);
    const hasBooked = orders.some(
      (o) =>
        o.status === 'confirmed' &&
        typeof o.summary?.hotelLabel === 'string' &&
        o.summary.hotelLabel.toLowerCase().includes(hotel.name.toLowerCase()),
    );
    if (!hasBooked) {
      throw new ForbiddenError('Only guests who booked this hotel can leave a review.');
    }

    const user = await this.users.findByPhone(phone);
    const displayName = user?.name?.trim() || 'Verified guest';
    return this.reviews.upsert(hotelId, phone, displayName, input.rating, input.text.trim());
  }
}
