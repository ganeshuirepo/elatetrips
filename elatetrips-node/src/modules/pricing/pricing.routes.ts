import { Router } from 'express';
import type { PricingController } from './pricing.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import { localEstimateSchema, pickupEstimateSchema } from './pricing.validation';

/**
 * @openapi
 * tags:
 *   - name: Pricing
 *     description: Cab fare estimates (local per-day package and pickup round-trip).
 */
export function buildPricingRouter(controller: PricingController): Router {
  const router = Router();

  /**
   * @openapi
   * /api/v1/pricing/local-estimate:
   *   post:
   *     tags: [Pricing]
   *     summary: Local sightseeing fare (per-day 8hr/80km package × days)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [vehicleId]
   *             properties:
   *               vehicleId: { type: string, example: "suv" }
   *               days: { type: integer, example: 3 }
   *     responses:
   *       200: { description: Local estimate }
   */
  router.post(
    '/local-estimate',
    validate({ body: localEstimateSchema }),
    asyncHandler(controller.localEstimate),
  );

  /**
   * @openapi
   * /api/v1/pricing/pickup-estimate:
   *   post:
   *     tags: [Pricing]
   *     summary: Complete-trip round-trip distance and fare from a pickup
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [pickupLat, pickupLon, destId]
   *             properties:
   *               pickupLat: { type: number, example: 12.9716 }
   *               pickupLon: { type: number, example: 77.5946 }
   *               destId: { type: string, example: "ooty" }
   *               vehicleId: { type: string, example: "suv" }
   *     responses:
   *       200: { description: "Estimate, or null when not computable" }
   */
  router.post(
    '/pickup-estimate',
    validate({ body: pickupEstimateSchema }),
    asyncHandler(controller.pickupEstimate),
  );

  return router;
}
