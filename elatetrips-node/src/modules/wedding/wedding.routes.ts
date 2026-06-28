import { Router } from 'express';
import type { WeddingController } from './wedding.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import { createWeddingEnquirySchema } from './wedding.validation';

/**
 * @openapi
 * tags:
 *   - name: Weddings
 *     description: Public wedding-enquiry leads from the planner.
 */
export function buildWeddingRouter(controller: WeddingController): Router {
  const router = Router();

  /**
   * @openapi
   * /api/v1/weddings/enquiry:
   *   post:
   *     tags: [Weddings]
   *     summary: Submit a wedding enquiry
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [contact, preWeddingGuests, postWeddingGuests, weddingDate]
   *             properties:
   *               contact:
   *                 type: object
   *                 required: [name, phone]
   *                 properties:
   *                   name: { type: string }
   *                   phone: { type: string }
   *                   email: { type: string }
   *               preWeddingGuests: { type: string }
   *               postWeddingGuests: { type: string }
   *               services: { type: array, items: { type: string } }
   *               weddingDate: { type: string }
   *               preferredHotels: { type: string }
   *               destination: { type: string }
   *               notes: { type: string }
   *     responses:
   *       201: { description: Enquiry recorded, returns the stored lead }
   *       400: { description: Validation error }
   */
  router.post('/enquiry', validate({ body: createWeddingEnquirySchema }), asyncHandler(controller.create));

  return router;
}
