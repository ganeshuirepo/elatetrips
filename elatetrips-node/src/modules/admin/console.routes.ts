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
  router.get('/me', asyncHandler(controller.me));
  router.put(
    '/listing',
    validate({ body: listingUpdateSchema }),
    asyncHandler(controller.updateListing),
  );
  router.get('/orders', asyncHandler(controller.myOrders));
  return router;
}
