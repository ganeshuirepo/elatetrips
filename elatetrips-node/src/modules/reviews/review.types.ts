/** Guest reviews for hotels — only guests who booked the hotel may write one. */

/** Public review DTO (reviewer phone is never exposed). */
export interface HotelReview {
  hotelId: string;
  name: string;
  rating: number; // 1–5
  text: string;
  createdAt: string;
}

/** Validated input for creating/updating the caller's review. */
export interface CreateReviewInput {
  rating: number;
  text: string;
}
