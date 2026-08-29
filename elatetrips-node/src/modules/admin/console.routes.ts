/**
 * Console routers for the admin/vendor dashboards (two separate mounts):
 *   - buildConsoleRouter -> POST /console/login, PUBLIC. loginRateLimit guards
 *     it (a public staff login is a prime brute-force target), then validate,
 *     then ConsoleService.login issues a scope:'console' token.
 *   - buildVendorRouter  -> /vendor/* behind consoleGuard('vendor','admin'):
 *     the vendor's own profile + their ONE listing + their bookings. 'admin' is
 *     accepted too so staff can inspect any vendor surface.
 * consoleGuard verifies the Bearer token and drops its claims on
 * res.locals.console for the controller to read.
 */
import { Router } from 'express';
import type { ConsoleController } from './console.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import { bodyField, loginRateLimit } from '../../common/middleware/rateLimit';
import { consoleGuard } from './console.guard';
import { consoleLoginSchema, listingUpdateSchema } from './admin.validation';

/**
 * @openapi
 * tags:
 *   - name: Console
 *     description: Admin & vendor dashboard accounts — login and the vendor's own view.
 */
export function buildConsoleRouter(controller: ConsoleController): Router {
  const router = Router();
  // Staff console reachable from the public internet — brute force is the
  // first thing it will meet.
  /**
   * @openapi
   * /api/v1/console/login:
   *   post:
   *     tags: [Console]
   *     summary: Staff sign-in for the admin, vendor, crew and ops consoles
   *     description: >-
   *       Returns a console token whose scope is 'console' and whose role decides which
   *       console will open: admin, vendor, crew, cm or om.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email: { type: string }
   *               password: { type: string, format: password }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.post(
    '/login',
    loginRateLimit(bodyField('username')),
    validate({ body: consoleLoginSchema }),
    asyncHandler(controller.login),
  );
  return router;
}

/** The vendor's own surface: profile + their ONE listing + their bookings. */
export function buildVendorRouter(controller: ConsoleController): Router {
  const router = Router();
  router.use(consoleGuard('vendor', 'admin'));
  /**
   * @openapi
   * /api/v1/console/me:
   *   get:
   *     tags: [Console]
   *     summary: Who this console token belongs to, and what it may see
   *     security: [{ consoleAuth: [] }]
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.get('/me', asyncHandler(controller.me));
  /**
   * @openapi
   * /api/v1/console/listing:
   *   put:
   *     tags: [Console]
   *     summary: A vendor updates their own listing
   *     description: Only the one listing the account is bound to — the binding is the authorisation.
   *     security: [{ consoleAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The changed listing fields." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.put(
    '/listing',
    validate({ body: listingUpdateSchema }),
    asyncHandler(controller.updateListing),
  );
  /**
   * @openapi
   * /api/v1/console/orders:
   *   get:
   *     tags: [Console]
   *     summary: Orders against this vendor's own listing
   *     security: [{ consoleAuth: [] }]
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.get('/orders', asyncHandler(controller.myOrders));
  return router;
}
