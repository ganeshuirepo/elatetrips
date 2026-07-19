import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { AdminController } from './admin.controller';
import type { ConsoleController } from './console.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import {
  vendorCreateSchema,
  activityCreateSchema,
  activityParamsSchema,
  activityUpdateSchema,
  bundleCreateSchema,
  bundleUpdateSchema,
  hotelCreateSchema,
  hotelUpdateSchema,
  idParamsSchema,
  vehicleCreateSchema,
  vehicleUpdateSchema,
} from './admin.validation';

/**
 * @openapi
 * tags:
 *   - name: Admin
 *     description: Admin console — create/update the mocked catalog (guarded by x-admin-key).
 */
export function buildAdminRouter(
  controller: AdminController,
  consoleController: ConsoleController,
  guard: RequestHandler,
): Router {
  const router = Router();
  router.use(guard);

  router.get('/overview', asyncHandler(controller.overview));
  router.get('/orders', asyncHandler(controller.listOrders));

  // Vendor onboarding: register the account bound to its one listing.
  router.get('/vendors', asyncHandler(consoleController.listVendors));
  router.post(
    '/vendors',
    validate({ body: vendorCreateSchema }),
    asyncHandler(consoleController.createVendor),
  );

  router.post('/hotels', validate({ body: hotelCreateSchema }), asyncHandler(controller.createHotel));
  router.put(
    '/hotels/:id',
    validate({ params: idParamsSchema, body: hotelUpdateSchema }),
    asyncHandler(controller.updateHotel),
  );

  router.post('/packages', validate({ body: bundleCreateSchema }), asyncHandler(controller.createBundle));
  router.put(
    '/packages/:id',
    validate({ params: idParamsSchema, body: bundleUpdateSchema }),
    asyncHandler(controller.updateBundle),
  );

  router.post('/vehicles', validate({ body: vehicleCreateSchema }), asyncHandler(controller.createVehicle));
  router.put(
    '/vehicles/:id',
    validate({ params: idParamsSchema, body: vehicleUpdateSchema }),
    asyncHandler(controller.updateVehicle),
  );

  router.post(
    '/activities',
    validate({ body: activityCreateSchema }),
    asyncHandler(controller.createActivity),
  );
  router.put(
    '/activities/:kind/:id',
    validate({ params: activityParamsSchema, body: activityUpdateSchema }),
    asyncHandler(controller.updateActivity),
  );

  return router;
}
