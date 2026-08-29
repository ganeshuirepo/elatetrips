/**
 * M5 route table — mounted under /api/v1/broadcast (additive; no collision with
 * the contracts-v1.1 router that serves the frozen POST /rfq/:id/broadcast path).
 * This surface exposes the richer wave-engine + bench operations M5 owns.
 *
 * Wiring pattern mirrors the rest of the codebase:
 *   router.<verb>(path, validate({...}), asyncHandler(controller.method))
 * validate() coerces + guards the edge; asyncHandler forwards rejections to the
 * central error middleware; the service does the work.
 */
import { Router } from 'express';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import type { BroadcastController } from './broadcast.controller';
import {
  benchEvaluateBodySchema,
  dispatchWaveBodySchema,
  rfqIdParamSchema,
  stopBodySchema,
} from './broadcast.validation';

export function buildBroadcastRouter(c: BroadcastController): Router {
  const router = Router();

  // FR5.1/5.2/5.3 — dispatch the next wave for an RFQ (route-aware + fairness).
  /**
   * @openapi
   * /api/v1/broadcast/rfq/{rfqId}/wave:
   *   post:
   *     tags: [Broadcast]
   *     summary: Dispatch the next wave of suppliers for an RFQ
   *     description: >-
   *       Route-aware and fairness-aware: who gets asked depends on the track, the
   *       destination and how much work each supplier has already been sent.
   *     parameters:
   *       - in: path
   *         name: rfqId
   *         required: true
   *         schema: { type: string }
   *         description: The RFQ.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "Wave options — size, and any supplier ids to force in or out." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post(
    '/rfq/:rfqId/wave',
    validate({ params: rfqIdParamSchema, body: dispatchWaveBodySchema }),
    asyncHandler(c.dispatchWave),
  );

  // Inspect wave/broadcast state for an RFQ.
  /**
   * @openapi
   * /api/v1/broadcast/rfq/{rfqId}/waves:
   *   get:
   *     tags: [Broadcast]
   *     summary: Every wave sent for an RFQ, and where each one got to
   *     parameters:
   *       - in: path
   *         name: rfqId
   *         required: true
   *         schema: { type: string }
   *         description: The RFQ.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.get('/rfq/:rfqId/waves', validate({ params: rfqIdParamSchema }), asyncHandler(c.getWaves));

  // FR5.5 — stop conditions: close with win/loss notices.
  /**
   * @openapi
   * /api/v1/broadcast/rfq/{rfqId}/stop:
   *   post:
   *     tags: [Broadcast]
   *     summary: Close the broadcast — with win and loss notices
   *     description: >-
   *       Suppliers who quoted and did not win are told. A request that simply goes quiet is
   *       how a supplier stops answering the next one.
   *     parameters:
   *       - in: path
   *         name: rfqId
   *         required: true
   *         schema: { type: string }
   *         description: The RFQ.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "Why it is stopping, and which quote won if one did." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post(
    '/rfq/:rfqId/stop',
    validate({ params: rfqIdParamSchema, body: stopBodySchema }),
    asyncHandler(c.stop),
  );

  // FR5.2a — evaluate + apply peak-season bench activation/reversion.
  /**
   * @openapi
   * /api/v1/broadcast/bench/evaluate:
   *   post:
   *     tags: [Broadcast]
   *     summary: Evaluate and apply peak-season bench activation or reversion
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The window being evaluated." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/bench/evaluate', validate({ body: benchEvaluateBodySchema }), asyncHandler(c.evaluateBench));

  return router;
}
