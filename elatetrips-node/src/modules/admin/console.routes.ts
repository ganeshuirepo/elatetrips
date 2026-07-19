import { Router } from 'express';
import type { ConsoleController } from './console.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
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
  router.post('/login', validate({ body: consoleLoginSchema }), asyncHandler(controller.login));
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
