import { Router } from 'express';
import type { PartnerController } from './partner.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import { createPartnerEoiSchema } from './partner.validation';

/**
 * @openapi
 * tags:
 *   - name: Partners
 *     description: Public hotelier "Expression of Interest" submissions.
 */
export function buildPartnerRouter(controller: PartnerController): Router {
  const router = Router();

  /**
   * @openapi
   * /api/v1/partners/eoi:
   *   post:
   *     tags: [Partners]
   *     summary: Submit a hotelier expression of interest
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [property, surprise, inventory, consent]
   *             properties:
   *               property:
   *                 type: object
   *                 required: [hotelName, contactName, email, phone]
   *               services: { type: array, items: { type: object } }
   *               surprise: { type: object, required: [capable] }
   *               inventory: { type: object, required: [updateMethod] }
   *               notes: { type: string }
   *               consent: { type: boolean }
   *     responses:
   *       201: { description: EOI recorded, returns the stored submission }
   *       400: { description: Validation error }
   */
  router.post('/eoi', validate({ body: createPartnerEoiSchema }), asyncHandler(controller.create));

  return router;
}
