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
  router.post('/rfq', asyncHandler(c.createRfq));
  router.patch('/rfq/:rfqId', asyncHandler(c.patchRfq));
  router.post('/rfq/:rfqId/submit', asyncHandler(c.submitRfq));

  // Itinerary (M2)
  router.post('/rfq/:rfqId/itinerary', asyncHandler(c.buildItinerary));
  router.patch('/itinerary/:itineraryId', asyncHandler(c.patchItinerary));

  // Directory & routing (M3/M12)
  router.get('/suppliers', asyncHandler(c.listSuppliers));

  // Broadcast (M5)
  router.post('/rfq/:rfqId/broadcast', asyncHandler(c.broadcast));

  // Partner surface (M6)
  router.get('/link/:token', asyncHandler(c.getLink));
  router.post('/link/:token/quote', asyncHandler(c.linkQuote));
  router.post('/link/:token/enrichment', asyncHandler(c.linkEnrichment));
  router.post('/link/:token/reconfirm', asyncHandler(c.linkReconfirm));

  // Quote intelligence (M7)
  router.get('/rfq/:rfqId/quotes', asyncHandler(c.listQuotes));
  router.post('/rfq/:rfqId/shortlist', asyncHandler(c.shortlist));
  router.post('/quote/:quoteId/negotiate', asyncHandler(c.negotiate));

  // Booking & fulfilment (M8/M9)
  router.post('/quote/:quoteId/checkout', asyncHandler(c.checkout));
  router.post('/webhooks/razorpay', asyncHandler(c.razorpayWebhook));
  router.get('/booking/:bookingId/followups', asyncHandler(c.getFollowups));

  // Policy & content (M14/M15/M16)
  router.get('/policy', asyncHandler(c.getPolicy));
  router.get('/route-packs', asyncHandler(c.getRoutePacks));
  router.get('/pois', asyncHandler(c.getPois));
  router.get('/packages', asyncHandler(c.getPackages));
  router.post('/package/:packageId/delta', asyncHandler(c.packageDelta));

  return router;
}
