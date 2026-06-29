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

/** Mounts every module router under the versioned API prefix. */
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

  return router;
}
