/**
 * M17 route table — mounted at /api/v1/ratecard, additively beside the existing
 * module routers (a new prefix, so no existing route is touched). These endpoints
 * are internal supply-side surfaces, not part of the frozen /contracts/api.md;
 * formalizing them (and the M17 events) is a /contracts change requiring a delta.
 *
 * Validation (→ 400) runs at the edge via validate(); the service validates each
 * row (→ reported rejections), emits audit events (BR-6), and reads all business
 * values from config (BR-17).
 */
import { Router, type RequestHandler } from 'express';
import { partnerScopedGuard } from '../admin/console.guard';
import type { RateCardController } from './ratecard.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import {
  approveBodySchema,
  ingestBodySchema,
  partnerParamSchema,
  proposalParamSchema,
  rejectBodySchema,
  skuQuerySchema,
  skuRequiredQuerySchema,
  stagedQuerySchema,
} from './ratecard.validation';

/**
 * Access model. This surface originally had NO authentication, which made it
 * the most sensitive open endpoint in the API: `/partners/:id/rows` and `/rate`
 * return a partner's negotiated rates (the cost base a margin is built on),
 * `/partners/:id/ingest` submits rates in their name, and
 * `/staged/:id/approve` promotes a proposal to live pricing — the human review
 * step, so an open approve endpoint means the review can approve itself.
 * Validation was present on all eight routes; it answers "is this well-formed",
 * never "who is asking".
 *
 * Two tiers now, because a rate card belongs to ONE partner:
 *
 *   ownPartner  /partners/:partnerId/*  — that partner, or an ops role acting
 *               for them. This is what backs /partner/ratecard/:partnerId.
 *   opsGuard    /staged, /staged/:id/approve|reject — never self-service. A
 *               partner proposing a rate must not also be able to approve it;
 *               that separation is the entire point of staging.
 *
 * The partner id in the path is an ADDRESS, not a secret — it is short and
 * shared in email — so authorisation is the guard's job, never the URL's.
 *
 * NOTE for ops scripts: the partner-scoped routes take a console Bearer token
 * (role admin/cm/om), not the shared x-admin-key, which only opens the staged
 * queue. Nothing calls /ratecard today, so this breaks no existing caller.
 */
export function buildRatecardRouter(c: RateCardController, opsGuard: RequestHandler): Router {
  const router = Router();

  // A partner acting on its OWN rates, or ops acting for anyone. The id in the
  // path is an address; this is what authorises the request. See
  // partnerScopedGuard.
  const ownPartner = partnerScopedGuard('admin', 'cm', 'om');

  // Ingestion
  /**
   * @openapi
   * /api/v1/ratecard/partners/{partnerId}/ingest:
   *   post:
   *     tags: [Ratecards]
   *     summary: Take in a partner's rate card
   *     description: Rates land STAGED, not live — nothing a partner sends prices a trip until somebody approves it.
   *     parameters:
   *       - in: path
   *         name: partnerId
   *         required: true
   *         schema: { type: string }
   *         description: The partner whose rates these are.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The rate rows." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post(
    '/partners/:partnerId/ingest',
    ownPartner,
    validate({ params: partnerParamSchema, body: ingestBodySchema }),
    asyncHandler(c.ingest),
  );
  /**
   * @openapi
   * /api/v1/ratecard/partners/{partnerId}/sync:
   *   post:
   *     tags: [Ratecards]
   *     summary: Re-pull a partner's rates from their feed
   *     parameters:
   *       - in: path
   *         name: partnerId
   *         required: true
   *         schema: { type: string }
   *         description: The partner.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post(
    '/partners/:partnerId/sync',
    ownPartner,
    validate({ params: partnerParamSchema }),
    asyncHandler(c.sync),
  );

  // Staged review
  /**
   * @openapi
   * /api/v1/ratecard/staged:
   *   get:
   *     tags: [Ratecards]
   *     summary: Rate changes waiting for review
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.get('/staged', opsGuard, validate({ query: stagedQuerySchema }), asyncHandler(c.listStaged));
  /**
   * @openapi
   * /api/v1/ratecard/staged/{proposalId}/approve:
   *   post:
   *     tags: [Ratecards]
   *     summary: Approve a staged rate change — this is what makes it live
   *     parameters:
   *       - in: path
   *         name: proposalId
   *         required: true
   *         schema: { type: string }
   *         description: The staged proposal.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "Who approved it, and any note." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post(
    '/staged/:proposalId/approve',
    opsGuard,
    validate({ params: proposalParamSchema, body: approveBodySchema }),
    asyncHandler(c.approveStaged),
  );
  /**
   * @openapi
   * /api/v1/ratecard/staged/{proposalId}/reject:
   *   post:
   *     tags: [Ratecards]
   *     summary: Reject a staged rate change
   *     parameters:
   *       - in: path
   *         name: proposalId
   *         required: true
   *         schema: { type: string }
   *         description: The staged proposal.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The reason — it goes back to the partner." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post(
    '/staged/:proposalId/reject',
    opsGuard,
    validate({ params: proposalParamSchema, body: rejectBodySchema }),
    asyncHandler(c.rejectStaged),
  );

  // Freshness
  /**
   * @openapi
   * /api/v1/ratecard/partners/{partnerId}/freshness:
   *   get:
   *     tags: [Ratecards]
   *     summary: How old this partner's rates are
   *     description: Stale rates are the quiet way a quote goes out wrong, so freshness is a first-class question.
   *     parameters:
   *       - in: path
   *         name: partnerId
   *         required: true
   *         schema: { type: string }
   *         description: The partner.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.get(
    '/partners/:partnerId/freshness',
    ownPartner,
    validate({ params: partnerParamSchema }),
    asyncHandler(c.freshness),
  );

  // Booking-time snapshot + ledger inspection
  /**
   * @openapi
   * /api/v1/ratecard/partners/{partnerId}/rate:
   *   get:
   *     tags: [Ratecards]
   *     summary: The rate for one SKU, as it stands right now
   *     description: This is the figure a booking snapshots, so it is answered from the ledger rather than recomputed later.
   *     parameters:
   *       - in: path
   *         name: partnerId
   *         required: true
   *         schema: { type: string }
   *         description: The partner.
   *       - in: query
   *         name: sku
   *         schema: { type: string }
   *         description: The item being priced.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.get(
    '/partners/:partnerId/rate',
    ownPartner,
    validate({ params: partnerParamSchema, query: skuQuerySchema }),
    asyncHandler(c.rate),
  );
  /**
   * @openapi
   * /api/v1/ratecard/partners/{partnerId}/rows:
   *   get:
   *     tags: [Ratecards]
   *     summary: Every ledger row behind a SKU's rate — the audit view
   *     parameters:
   *       - in: path
   *         name: partnerId
   *         required: true
   *         schema: { type: string }
   *         description: The partner.
   *       - in: query
   *         name: sku
   *         schema: { type: string }
   *         description: The item. Required.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.get(
    '/partners/:partnerId/rows',
    ownPartner,
    validate({ params: partnerParamSchema, query: skuRequiredQuerySchema }),
    asyncHandler(c.rows),
  );

  return router;
}
