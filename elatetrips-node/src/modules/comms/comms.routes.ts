/**
 * M4 comms route table. Mounted at /api/v1/comm (additive — a brand-new prefix,
 * no collision with existing module routers or the contracts-v1.1 surface). The
 * BRD's integration contract is `POST /comm/send` + the event stream (M4 §
 * parallel note); the rest are the supporting webhooks and audit reads.
 *
 * validate() runs the zod guards at the edge; the service does the work and emits
 * telemetry. Route layer stays declarative.
 */
import { Router } from 'express';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import type { CommsController } from './comms.controller';
import {
  sendBodySchema,
  verifyBodySchema,
  inboundBodySchema,
  deliveryBodySchema,
  optOutBodySchema,
  rfqParamSchema,
} from './comms.validation';

export function buildCommsRouter(c: CommsController): Router {
  const router = Router();

  router.post('/send', validate({ body: sendBodySchema }), asyncHandler(c.send));
  router.post('/verify', validate({ body: verifyBodySchema }), asyncHandler(c.verify));
  router.post('/inbound', validate({ body: inboundBodySchema }), asyncHandler(c.inbound));
  router.post('/delivery', validate({ body: deliveryBodySchema }), asyncHandler(c.delivery));
  router.post('/opt-out', validate({ body: optOutBodySchema }), asyncHandler(c.optOut));
  router.get('/rfq/:rfqId/deliveries', validate({ params: rfqParamSchema }), asyncHandler(c.deliveries));

  return router;
}
