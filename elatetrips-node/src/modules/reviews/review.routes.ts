import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { ReviewController } from './review.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import { createReviewSchema, reviewParamSchema } from './review.validation';

/**
 * @openapi
 * tags:
 *   - name: Reviews
 *     description: Guest reviews for hotels (write requires a confirmed booking).
 */
export function buildReviewRouter(controller: ReviewController, authGuard: RequestHandler): Router {
  const router = Router();

  /**
   * @openapi
   * /api/v1/hotels/{hotelId}/reviews:
   *   get:
   *     tags: [Reviews]
   *     summary: List guest reviews for a hotel
   *     parameters:
   *       - { in: path, name: hotelId, required: true, schema: { type: string } }
   *     responses:
   *       200: { description: Reviews, newest first }
   */
  router.get(
    '/:hotelId/reviews',
    validate({ params: reviewParamSchema }),
    asyncHandler(controller.list),
  );

  /**
   * @openapi
   * /api/v1/hotels/{hotelId}/reviews:
   *   post:
   *     tags: [Reviews]
   *     summary: Create or update the signed-in guest's review (booked guests only)
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: hotelId, required: true, schema: { type: string } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [rating, text]
   *             properties:
   *               rating: { type: integer, minimum: 1, maximum: 5 }
   *               text: { type: string, minLength: 5, maxLength: 600 }
   *     responses:
   *       201: { description: Review saved }
   *       401: { description: Not signed in }
   *       403: { description: Guest has not booked this hotel }
   *       404: { description: Hotel not found }
   */
  router.post(
    '/:hotelId/reviews',
    authGuard,
    validate({ params: reviewParamSchema, body: createReviewSchema }),
    asyncHandler(controller.create),
  );

  return router;
}
