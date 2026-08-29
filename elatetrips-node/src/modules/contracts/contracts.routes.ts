/**
 * Contracts-v1.1 route table — EXACTLY the endpoints in `/contracts/api.md`, no
 * more (FR-006-1). Mounted at the /api/v1 root (paths are /rfq, /itinerary, …),
 * additively beside the existing module routers — no existing route is touched.
 *
 * Validation (→ 422), audit emission (BR-6) and PII masking (BR-3) all happen
 * inside the engine the controller calls, so the route layer stays declarative.
 */
import { Router } from 'express';
import type { ContractsController } from './contracts.controller';
import { asyncHandler } from '../../common/http/asyncHandler';

export function buildContractsRouter(c: ContractsController): Router {
  const router = Router();

  // Intake (M1)
  /**
   * @openapi
   * /api/v1/rfq:
   *   post:
   *     tags: [Contracts]
   *     summary: Open a draft RFQ (M1)
   *     description: >-
   *       Creates the request a traveller is building. It stays a draft until
   *       POST /rfq/{rfqId}/submit — nothing reaches a supplier before that.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The RFQ draft. Shape: contracts/rfq.schema.json." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/rfq', asyncHandler(c.createRfq));
  /**
   * @openapi
   * /api/v1/rfq/{rfqId}:
   *   patch:
   *     tags: [Contracts]
   *     summary: Amend a draft RFQ
   *     parameters:
   *       - in: path
   *         name: rfqId
   *         required: true
   *         schema: { type: string }
   *         description: The draft to amend.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "Only the fields being changed. Shape: contracts/rfq.schema.json." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.patch('/rfq/:rfqId', asyncHandler(c.patchRfq));
  /**
   * @openapi
   * /api/v1/rfq/{rfqId}/submit:
   *   post:
   *     tags: [Contracts]
   *     summary: Submit the RFQ — this is what starts the quote flow
   *     description: >-
   *       Freezes the draft and, when RFQFLOW_ENABLED is on, sends the acknowledgement to
   *       the traveller and the request to matching suppliers. Off by default.
   *     parameters:
   *       - in: path
   *         name: rfqId
   *         required: true
   *         schema: { type: string }
   *         description: The draft to submit.
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               customer_email: { type: string, description: "Where the acknowledgement goes." }
   *               customer_name: { type: string }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/rfq/:rfqId/submit', asyncHandler(c.submitRfq));

  // Itinerary (M2)
  /**
   * @openapi
   * /api/v1/rfq/{rfqId}/itinerary:
   *   post:
   *     tags: [Contracts]
   *     summary: Build the day-by-day itinerary for an RFQ (M2)
   *     parameters:
   *       - in: path
   *         name: rfqId
   *         required: true
   *         schema: { type: string }
   *         description: The RFQ to build against.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "Build options. Shape: contracts/itinerary.schema.json." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/rfq/:rfqId/itinerary', asyncHandler(c.buildItinerary));
  /**
   * @openapi
   * /api/v1/itinerary/{itineraryId}:
   *   patch:
   *     tags: [Contracts]
   *     summary: Edit an itinerary — reorder stops, change nights
   *     parameters:
   *       - in: path
   *         name: itineraryId
   *         required: true
   *         schema: { type: string }
   *         description: The itinerary to edit.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The changed legs or days. Shape: contracts/itinerary.schema.json." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.patch('/itinerary/:itineraryId', asyncHandler(c.patchItinerary));

  // Directory & routing (M3/M12)
  /*
   * Deliberately NOT in the OpenAPI spec: /suppliers is mounted by the supplier
   * module BEFORE this catch-all router (see routes/index.ts), so that richer M3
   * route is what actually answers GET /api/v1/suppliers. Documenting this one
   * would put an operation in the spec that no request can reach.
   */
  router.get('/suppliers', asyncHandler(c.listSuppliers));

  // Broadcast (M5)
  /**
   * @openapi
   * /api/v1/rfq/{rfqId}/broadcast:
   *   post:
   *     tags: [Contracts, Broadcast]
   *     summary: Send the RFQ to a wave of suppliers (M5)
   *     description: >-
   *       Returns the wave number and the supplier ids it went to. Each supplier gets a
   *       recipient-bound link (BR-15), never a shared URL.
   *     parameters:
   *       - in: path
   *         name: rfqId
   *         required: true
   *         schema: { type: string }
   *         description: The submitted RFQ.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "Wave options — supplier ids, wave size. Shape: contracts/api.md." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/rfq/:rfqId/broadcast', asyncHandler(c.broadcast));

  // Partner surface (M6)
  /**
   * @openapi
   * /api/v1/link/{token}:
   *   get:
   *     tags: [Contracts]
   *     summary: Open a supplier link — the partner-facing job card (M6)
   *     description: >-
   *       Unauthenticated by design: the token IS the credential and it is bound to one
   *       recipient (BR-15). Traveller PII comes back masked (BR-3).
   *     parameters:
   *       - in: path
   *         name: token
   *         required: true
   *         schema: { type: string }
   *         description: The tokenised link from the broadcast.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '404': { $ref: '#/components/responses/NotFound' }
   */
  router.get('/link/:token', asyncHandler(c.getLink));
  /**
   * @openapi
   * /api/v1/link/{token}/quote:
   *   post:
   *     tags: [Contracts]
   *     summary: A supplier submits their quote
   *     parameters:
   *       - in: path
   *         name: token
   *         required: true
   *         schema: { type: string }
   *         description: The supplier link.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "Line items and totals, in minor units. Shape: contracts/quote.schema.json." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/link/:token/quote', asyncHandler(c.linkQuote));
  /**
   * @openapi
   * /api/v1/link/{token}/enrichment:
   *   post:
   *     tags: [Contracts]
   *     summary: A supplier adds detail to a quote — photographs, notes, inclusions
   *     parameters:
   *       - in: path
   *         name: token
   *         required: true
   *         schema: { type: string }
   *         description: The supplier link.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The enrichment payload. Shape: contracts/quote.schema.json." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/link/:token/enrichment', asyncHandler(c.linkEnrichment));
  /**
   * @openapi
   * /api/v1/link/{token}/reconfirm:
   *   post:
   *     tags: [Contracts]
   *     summary: A supplier reconfirms a quote before it is booked
   *     parameters:
   *       - in: path
   *         name: token
   *         required: true
   *         schema: { type: string }
   *         description: The supplier link.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The reconfirmation. Shape: contracts/api.md." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/link/:token/reconfirm', asyncHandler(c.linkReconfirm));

  // Quote intelligence (M7)
  /**
   * @openapi
   * /api/v1/rfq/{rfqId}/quotes:
   *   get:
   *     tags: [Contracts]
   *     summary: Every quote received for an RFQ (M7)
   *     parameters:
   *       - in: path
   *         name: rfqId
   *         required: true
   *         schema: { type: string }
   *         description: The RFQ.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   */
  router.get('/rfq/:rfqId/quotes', asyncHandler(c.listQuotes));
  /**
   * @openapi
   * /api/v1/rfq/{rfqId}/shortlist:
   *   post:
   *     tags: [Contracts]
   *     summary: Shortlist the quotes to put in front of the traveller
   *     description: >-
   *       Lapsed quotes are dropped here rather than at render time — an expired price must
   *       never reach a comparison screen.
   *     parameters:
   *       - in: path
   *         name: rfqId
   *         required: true
   *         schema: { type: string }
   *         description: The RFQ.
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               customer_email: { type: string, description: "Where the comparison summary goes." }
   *               customer_name: { type: string }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/rfq/:rfqId/shortlist', asyncHandler(c.shortlist));
  /**
   * @openapi
   * /api/v1/quote/{quoteId}/negotiate:
   *   post:
   *     tags: [Contracts]
   *     summary: Counter a quote
   *     parameters:
   *       - in: path
   *         name: quoteId
   *         required: true
   *         schema: { type: string }
   *         description: The quote being countered.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "Target price or changed scope. Shape: contracts/quote.schema.json." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/quote/:quoteId/negotiate', asyncHandler(c.negotiate));

  // Booking & fulfilment (M8/M9)
  /**
   * @openapi
   * /api/v1/quote/{quoteId}/checkout:
   *   post:
   *     tags: [Contracts]
   *     summary: Turn an accepted quote into a booking (M8)
   *     description: The policy in force is snapshotted onto the booking at capture (BR-18).
   *     parameters:
   *       - in: path
   *         name: quoteId
   *         required: true
   *         schema: { type: string }
   *         description: The accepted quote.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/quote/:quoteId/checkout', asyncHandler(c.checkout));
  /**
   * @openapi
   * /api/v1/webhooks/razorpay:
   *   post:
   *     tags: [Contracts]
   *     summary: Payment webhook
   *     description: >-
   *       Called by the gateway, not by a client. Answers 200 to anything it can parse so the
   *       gateway stops retrying; what the payment MEANS is decided inside the engine.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The gateway event payload." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   */
  router.post('/webhooks/razorpay', asyncHandler(c.razorpayWebhook));
  /**
   * @openapi
   * /api/v1/booking/{bookingId}/followups:
   *   get:
   *     tags: [Contracts]
   *     summary: The follow-up schedule for a booking (M9)
   *     parameters:
   *       - in: path
   *         name: bookingId
   *         required: true
   *         schema: { type: string }
   *         description: The booking.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   */
  router.get('/booking/:bookingId/followups', asyncHandler(c.getFollowups));

  // Policy & content (M14/M15/M16)
  /**
   * @openapi
   * /api/v1/policy:
   *   get:
   *     tags: [Contracts]
   *     summary: The booking and refund policy in force (M14)
   *     description: >-
   *       Deposit percentage, balance due date, refund bands. Empty tables are expected: the
   *       engine ships with no business values baked in (BR-17).
   *     parameters:
   *       - in: query
   *         name: scope
   *         schema: { type: string, enum: [platform_default, partner, quote] }
   *       - in: query
   *         name: partner_id
   *         schema: { type: string }
   *         description: Required when scope is partner.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   */
  router.get('/policy', asyncHandler(c.getPolicy));
  /**
   * @openapi
   * /api/v1/route-packs:
   *   get:
   *     tags: [Contracts]
   *     summary: Pre-built multi-stop routes for a destination (M15)
   *     parameters:
   *       - in: query
   *         name: destination
   *         schema: { type: string }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   */
  router.get('/route-packs', asyncHandler(c.getRoutePacks));
  /**
   * @openapi
   * /api/v1/pois:
   *   get:
   *     tags: [Contracts]
   *     summary: Points of interest for a destination
   *     parameters:
   *       - in: query
   *         name: destination
   *         schema: { type: string }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   */
  router.get('/pois', asyncHandler(c.getPois));
  /**
   * @openapi
   * /api/v1/packages:
   *   get:
   *     tags: [Contracts]
   *     summary: Canonical packages for a destination and occasion (M16)
   *     parameters:
   *       - in: query
   *         name: destination
   *         schema: { type: string }
   *       - in: query
   *         name: occasion
   *         schema: { type: string }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   */
  router.get('/packages', asyncHandler(c.getPackages));
  /**
   * @openapi
   * /api/v1/package/{packageId}/delta:
   *   post:
   *     tags: [Contracts]
   *     summary: Price a change to a canonical package
   *     parameters:
   *       - in: path
   *         name: packageId
   *         required: true
   *         schema: { type: string }
   *         description: The package being changed.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The requested changes. Shape: contracts/canonical-package.schema.json." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/package/:packageId/delta', asyncHandler(c.packageDelta));

  return router;
}
