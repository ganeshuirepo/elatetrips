import { Router } from 'express';
import type { PartnerController } from './partner.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import {
  createPartnerEoiSchema,
  updatePartnerEoiSchema,
  eoiParamsSchema,
  eoiOwnerQuerySchema,
} from './partner.validation';

/**
 * @openapi
 * tags:
 *   - name: Partners
 *     description: Public vendor "Expression of Interest" submissions — one template per partner track.
 */
export function buildPartnerRouter(controller: PartnerController): Router {
  const router = Router();

  /**
   * @openapi
   * /api/v1/partners/eoi:
   *   post:
   *     tags: [Partners]
   *     summary: Submit a vendor expression of interest
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [partnerType, business, consent]
   *             properties:
   *               partnerType:
   *                 type: string
   *                 enum: [hotel, transport, onground, adventure, guide, gifting]
   *               business:
   *                 type: object
   *                 required: [businessName, email, phone]
   *               details:
   *                 type: object
   *                 description: Track-specific template answers (string or string[] per field).
   *               portfolio:
   *                 type: array
   *                 items: { type: object }
   *               notes: { type: string }
   *               consent: { type: boolean }
   *     responses:
   *       201: { description: EOI recorded, returns the stored submission with its reference id }
   *       400: { description: Validation error }
   */
  router.post('/eoi', validate({ body: createPartnerEoiSchema }), asyncHandler(controller.create));

  /**
   * @openapi
   * /api/v1/partners/eoi/{referenceId}:
   *   get:
   *     tags: [Partners]
   *     summary: Load an existing submission for editing
   *     description: The registered email doubles as the ownership proof (no partner accounts yet).
   *     parameters:
   *       - in: path
   *         name: referenceId
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: email
   *         required: true
   *         schema: { type: string, format: email }
   *     responses:
   *       200: { description: The stored submission }
   *       404: { description: No submission for that reference id + email }
   */
  router.get(
    '/eoi/:referenceId',
    validate({ params: eoiParamsSchema, query: eoiOwnerQuerySchema }),
    asyncHandler(controller.get),
  );

  /**
   * @openapi
   * /api/v1/partners/eoi/{referenceId}:
   *   put:
   *     tags: [Partners]
   *     summary: Update a submission (portfolio, details, contact)
   *     description: Replaces the editable content; the partner track itself cannot change.
   *     parameters:
   *       - in: path
   *         name: referenceId
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: email
   *         required: true
   *         schema: { type: string, format: email }
   *     responses:
   *       200: { description: The updated submission }
   *       400: { description: Validation error }
   *       404: { description: No submission for that reference id + email }
   */
  router.put(
    '/eoi/:referenceId',
    validate({ params: eoiParamsSchema, query: eoiOwnerQuerySchema, body: updatePartnerEoiSchema }),
    asyncHandler(controller.update),
  );

  return router;
}
