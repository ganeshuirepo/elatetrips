import { HotelReviewModel } from './review.model';
import type { HotelReview } from './review.types';

/** Persistence contract for hotel reviews. */
export interface IReviewRepository {
  listByHotel(hotelId: string): Promise<HotelReview[]>;
  /** Insert or replace the caller's review of a hotel (one per guest per hotel). */
  upsert(
    hotelId: string,
    phone: string,
    name: string,
    rating: number,
    text: string,
  ): Promise<HotelReview>;
}

/** Public projection: never leak the reviewer's phone or Mongo internals. */
const projection = '-_id -__v -phone';

export class ReviewRepository implements IReviewRepository {
  async listByHotel(hotelId: string): Promise<HotelReview[]> {
    return HotelReviewModel.find({ hotelId })
      .sort({ createdAt: -1 })
      .select(projection)
      .lean<HotelReview[]>()
      .exec();
  }

  async upsert(
    hotelId: string,
    phone: string,
    name: string,
    rating: number,
    text: string,
  ): Promise<HotelReview> {
    await HotelReviewModel.updateOne(
      { hotelId, phone },
      { $set: { name, rating, text } },
      { upsert: true },
    ).exec();
    const saved = await HotelReviewModel.findOne({ hotelId, phone })
      .select(projection)
      .lean<HotelReview>()
      .exec();
    // The document was just upserted, so it must exist; guard for type safety.
    if (!saved) throw new Error('Review upsert failed unexpectedly');
    return saved;
  }
}
