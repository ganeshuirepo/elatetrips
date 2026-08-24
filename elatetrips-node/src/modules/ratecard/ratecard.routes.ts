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
import { Router } from 'express';
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

export function buildRatecardRouter(c: RateCardController): Router {
  const router = Router();

  // Ingestion
  router.post(
    '/partners/:partnerId/ingest',
    validate({ params: partnerParamSchema, body: ingestBodySchema }),
    asyncHandler(c.ingest),
  );
  router.post(
    '/partners/:partnerId/sync',
    validate({ params: partnerParamSchema }),
    asyncHandler(c.sync),
  );

  // Staged review
  router.get('/staged', validate({ query: stagedQuerySchema }), asyncHandler(c.listStaged));
  router.post(
    '/staged/:proposalId/approve',
    validate({ params: proposalParamSchema, body: approveBodySchema }),
    asyncHandler(c.approveStaged),
  );
  router.post(
    '/staged/:proposalId/reject',
    validate({ params: proposalParamSchema, body: rejectBodySchema }),
    asyncHandler(c.rejectStaged),
  );

  // Freshness
  router.get(
    '/partners/:partnerId/freshness',
    validate({ params: partnerParamSchema }),
    asyncHandler(c.freshness),
  );

  // Booking-time snapshot + ledger inspection
  router.get(
    '/partners/:partnerId/rate',
    validate({ params: partnerParamSchema, query: skuQuerySchema }),
    asyncHandler(c.rate),
  );
  router.get(
    '/partners/:partnerId/rows',
    validate({ params: partnerParamSchema, query: skuRequiredQuerySchema }),
    asyncHandler(c.rows),
  );

  return router;
}
