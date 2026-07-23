import { Router } from 'express';
import type { Container } from '../container';
import { ok } from '../common/http/ApiResponse';
import { buildAuthRouter } from '../modules/auth/auth.routes';
import { buildUserRouter } from '../modules/users/user.routes';
import { buildOrderRouter } from '../modules/orders/order.routes';
import { buildCatalogRouter } from '../modules/catalog/catalog.routes';
import { buildPricingRouter } from '../modules/pricing/pricing.routes';
import { buildPartnerRouter } from '../modules/partner/partner.routes';
import { buildWeddingRouter } from '../modules/wedding/wedding.routes';
import { buildReviewRouter } from '../modules/reviews/review.routes';
import { buildAdminRouter } from '../modules/admin/admin.routes';
import { buildConsoleRouter, buildVendorRouter } from '../modules/admin/console.routes';

/**
 * Builds the API sub-router. The `/api/v1` prefix itself is applied by app.ts
 * (`app.use('/api/v1', buildApiRouter(container))`), so the paths mounted here
 * are relative to it. Each module router is built from the controller(s) the
 * container wired and is handed `authGuard` / `adminGuard` where its routes need
 * protecting; nothing here reaches into services or Mongoose directly.
 */
export function buildApiRouter(c: Container): Router {
  const router = Router();

  /**
   * @openapi
   * /api/v1/health:
   *   get:
   *     tags: [System]
   *     summary: Liveness probe
   *     responses:
   *       200: { description: OK }
   */
  router.get('/health', (_req, res) => ok(res, { status: 'ok', uptime: process.uptime() }));

  router.use('/auth', buildAuthRouter(c.controllers.auth));
  router.use('/users', buildUserRouter(c.controllers.users, c.authGuard));
  router.use('/orders', buildOrderRouter(c.controllers.orders, c.authGuard));
  router.use('/catalog', buildCatalogRouter(c.controllers.catalog));
  router.use('/pricing', buildPricingRouter(c.controllers.pricing));
  router.use('/partners', buildPartnerRouter(c.controllers.partners));
  router.use('/weddings', buildWeddingRouter(c.controllers.weddings));
  // Reviews hang off the hotel resource (…/hotels/:id/reviews), so the review
  // router is mounted under /hotels rather than a /reviews prefix.
  router.use('/hotels', buildReviewRouter(c.controllers.reviews, c.authGuard));
  // /admin is gated by adminGuard; /console and /vendor are both served by the
  // same console controller (their own routers handle any further auth).
  router.use('/admin', buildAdminRouter(c.controllers.admin, c.controllers.console, c.adminGuard));
  router.use('/console', buildConsoleRouter(c.controllers.console));
  router.use('/vendor', buildVendorRouter(c.controllers.console));

  return router;
}
