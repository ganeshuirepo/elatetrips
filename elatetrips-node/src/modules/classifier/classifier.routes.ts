/**
 * Classifier router (M12) — mounted at /api/v1/classifier (additive; no existing
 * route touched). Each route: validate() at the edge, asyncHandler() to funnel
 * rejections to the central error middleware, then the controller method.
 *
 * Routing is an INTERNAL decision surface: customer-visible framing never exposes
 * it (FR12.4). M5 consumes decisions through ClassifierService.getDecision, not
 * these HTTP routes.
 */
import { Router } from 'express';
import type { ClassifierController } from './classifier.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import {
  classifyBodySchema,
  overrideBodySchema,
  rfqIdParamSchema,
  upgradeBodySchema,
} from './classifier.validation';

/**
 * @openapi
 * tags:
 *   - name: Classifier
 *     description: M12 fulfilment route classifier (rules-only, BR-16).
 */
export function buildClassifierRouter(controller: ClassifierController): Router {
  const router = Router();

  /**
   * @openapi
   * /api/v1/classifier/classify:
   *   post:
   *     tags: [Classifier]
   *     summary: Classify an RFQ + itinerary into a fulfilment route
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [rfq, itinerary]
   *             properties:
   *               rfq: { type: object }
   *               itinerary: { type: object }
   *     responses:
   *       200: { description: Routing decision (route, confidence, rule_id, signals) }
   */
  router.post('/classify', validate({ body: classifyBodySchema }), asyncHandler(controller.classify));

  /**
   * @openapi
   * /api/v1/classifier/upgrade:
   *   post:
   *     tags: [Classifier]
   *     summary: Re-classify after post-classification scope creep (FR12.5)
   *     responses:
   *       200: { description: Re-classified decision (kind=upgraded, phase) }
   */
  router.post('/upgrade', validate({ body: upgradeBodySchema }), asyncHandler(controller.upgrade));

  /**
   * @openapi
   * /api/v1/classifier/override:
   *   post:
   *     tags: [Classifier]
   *     summary: Ops override of the route pre-broadcast (FR12.4, recorded with actor)
   *     responses:
   *       200: { description: Overridden decision }
   *       404: { description: No prior classification for the RFQ }
   */
  router.post('/override', validate({ body: overrideBodySchema }), asyncHandler(controller.override));

  /**
   * @openapi
   * /api/v1/classifier/decisions/{rfqId}:
   *   get:
   *     tags: [Classifier]
   *     summary: Current route decision for an RFQ (what M5 consumes)
   *     parameters:
   *       - { in: path, name: rfqId, required: true, schema: { type: string } }
   *     responses:
   *       200: { description: The decision, or null if none }
   */
  router.get(
    '/decisions/:rfqId',
    validate({ params: rfqIdParamSchema }),
    asyncHandler(controller.getDecision),
  );

  /**
   * @openapi
   * /api/v1/classifier/decisions/{rfqId}/audit:
   *   get:
   *     tags: [Classifier]
   *     summary: Audit trail of routing decisions for an RFQ (explainability)
   *     parameters:
   *       - { in: path, name: rfqId, required: true, schema: { type: string } }
   *     responses:
   *       200: { description: assignment.decided events for the RFQ }
   */
  router.get(
    '/decisions/:rfqId/audit',
    validate({ params: rfqIdParamSchema }),
    asyncHandler(controller.getAudit),
  );

  return router;
}
