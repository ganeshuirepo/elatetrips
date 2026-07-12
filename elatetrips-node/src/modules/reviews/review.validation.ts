import { z } from 'zod';

export const reviewParamSchema = z.object({
  hotelId: z.string().trim().min(1).max(40),
});

export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  text: z.string().trim().min(5, 'Tell us a little more (at least 5 characters).').max(600),
});
