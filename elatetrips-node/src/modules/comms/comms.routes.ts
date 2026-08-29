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

  /**
   * @openapi
   * /api/v1/comm/send:
   *   post:
   *     tags: [Comms]
   *     summary: Send a message on the best available channel
   *     description: >-
   *       Email today; WhatsApp when it lands. The channel order is configuration
   *       (COMM_CHANNEL_ORDER), and COMM_TEST_RECIPIENT diverts everything to one address
   *       with the intended recipient kept in a header.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "Recipient, template id and the values it needs." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/send', validate({ body: sendBodySchema }), asyncHandler(c.send));
  /**
   * @openapi
   * /api/v1/comm/verify:
   *   post:
   *     tags: [Comms]
   *     summary: Verify a contact address or number
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The address being verified and its proof." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/verify', validate({ body: verifyBodySchema }), asyncHandler(c.verify));
  /**
   * @openapi
   * /api/v1/comm/inbound:
   *   post:
   *     tags: [Comms]
   *     summary: Provider webhook — a reply came back
   *     description: Called by the messaging provider, not by a client.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The provider's inbound payload." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/inbound', validate({ body: inboundBodySchema }), asyncHandler(c.inbound));
  /**
   * @openapi
   * /api/v1/comm/delivery:
   *   post:
   *     tags: [Comms]
   *     summary: Provider webhook — delivery receipt
   *     description: Called by the messaging provider, not by a client.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The provider's delivery status." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/delivery', validate({ body: deliveryBodySchema }), asyncHandler(c.delivery));
  /**
   * @openapi
   * /api/v1/comm/opt-out:
   *   post:
   *     tags: [Comms]
   *     summary: Record an opt-out
   *     description: Consent is a rule, not a preference (BR-2) — once this is recorded nothing else may message them.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "Who is opting out, and of what." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/opt-out', validate({ body: optOutBodySchema }), asyncHandler(c.optOut));
  /**
   * @openapi
   * /api/v1/comm/rfq/{rfqId}/deliveries:
   *   get:
   *     tags: [Comms]
   *     summary: What was sent for one RFQ, and what happened to it
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
  router.get('/rfq/:rfqId/deliveries', validate({ params: rfqParamSchema }), asyncHandler(c.deliveries));

  return router;
}
