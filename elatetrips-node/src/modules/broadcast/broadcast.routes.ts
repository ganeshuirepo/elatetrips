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
  router.post(
    '/rfq/:rfqId/wave',
    validate({ params: rfqIdParamSchema, body: dispatchWaveBodySchema }),
    asyncHandler(c.dispatchWave),
  );

  // Inspect wave/broadcast state for an RFQ.
  router.get('/rfq/:rfqId/waves', validate({ params: rfqIdParamSchema }), asyncHandler(c.getWaves));

  // FR5.5 — stop conditions: close with win/loss notices.
  router.post(
    '/rfq/:rfqId/stop',
    validate({ params: rfqIdParamSchema, body: stopBodySchema }),
    asyncHandler(c.stop),
  );

  // FR5.2a — evaluate + apply peak-season bench activation/reversion.
  router.post('/bench/evaluate', validate({ body: benchEvaluateBodySchema }), asyncHandler(c.evaluateBench));

  return router;
}
