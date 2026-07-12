import { Schema, model } from 'mongoose';

/** Persisted review: keyed one-per-guest-per-hotel (phone is internal only). */
export interface HotelReviewDoc {
  hotelId: string;
  phone: string;
  name: string;
  rating: number;
  text: string;
}

const reviewSchema = new Schema<HotelReviewDoc>(
  {
    hotelId: { type: String, required: true, index: true },
    phone: { type: String, required: true },
    name: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, required: true },
  },
  { versionKey: false, timestamps: true, collection: 'hotel_reviews' },
);
reviewSchema.index({ hotelId: 1, phone: 1 }, { unique: true });

export const HotelReviewModel = model<HotelReviewDoc>('HotelReview', reviewSchema);
