/**
 * Admin console router — catalog CRUD plus vendor onboarding. EVERY route sits
 * behind `guard` (applied once via router.use): buildAdminGuard from
 * console.guard, which accepts either the shared x-admin-key header OR an
 * admin-role console Bearer token. Two controllers back it: AdminController owns
 * the mocked catalog (hotels / packages / vehicles / activities, plus the
 * overview + orders feeds the dashboard reads); ConsoleController owns vendor
 * accounts. Per route the chain is guard -> validate(Zod) ->
 * asyncHandler(controller.method), with logic in the matching service.
 */
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

  /**
   * @openapi
   * /api/v1/admin/overview:
   *   get:
   *     tags: [Admin]
   *     summary: Counts and recent activity for the admin dashboard
   *     security: [{ consoleAuth: [] }]
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.get('/overview', asyncHandler(controller.overview));
  /**
   * @openapi
   * /api/v1/admin/orders:
   *   get:
   *     tags: [Admin]
   *     summary: Every order, across all customers
   *     security: [{ consoleAuth: [] }]
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.get('/orders', asyncHandler(controller.listOrders));

  // Vendor onboarding: register the account bound to its one listing.
  /**
   * @openapi
   * /api/v1/admin/vendors:
   *   get:
   *     tags: [Admin]
   *     summary: Vendor accounts
   *     security: [{ consoleAuth: [] }]
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.get('/vendors', asyncHandler(consoleController.listVendors));
  /**
   * @openapi
   * /api/v1/admin/vendors:
   *   post:
   *     tags: [Admin]
   *     summary: Create a vendor account, bound to exactly one listing
   *     description: >-
   *       One account, one listing. A vendor who could see a second property could see a
   *       competitor's bookings.
   *     security: [{ consoleAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The vendor account and the listing it is bound to." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.post(
    '/vendors',
    validate({ body: vendorCreateSchema }),
    asyncHandler(consoleController.createVendor),
  );

  /**
   * @openapi
   * /api/v1/admin/hotels:
   *   post:
   *     tags: [Admin]
   *     summary: Add a hotel
   *     security: [{ consoleAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The hotel record." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.post('/hotels', validate({ body: hotelCreateSchema }), asyncHandler(controller.createHotel));
  /**
   * @openapi
   * /api/v1/admin/hotels/{id}:
   *   put:
   *     tags: [Admin]
   *     summary: Update a hotel
   *     security: [{ consoleAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *         description: The hotel.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The changed fields." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.put(
    '/hotels/:id',
    validate({ params: idParamsSchema, body: hotelUpdateSchema }),
    asyncHandler(controller.updateHotel),
  );

  /**
   * @openapi
   * /api/v1/admin/packages:
   *   post:
   *     tags: [Admin]
   *     summary: Add a celebration package
   *     security: [{ consoleAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The package record." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.post('/packages', validate({ body: bundleCreateSchema }), asyncHandler(controller.createBundle));
  /**
   * @openapi
   * /api/v1/admin/packages/{id}:
   *   put:
   *     tags: [Admin]
   *     summary: Update a celebration package
   *     security: [{ consoleAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *         description: The package.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The changed fields." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.put(
    '/packages/:id',
    validate({ params: idParamsSchema, body: bundleUpdateSchema }),
    asyncHandler(controller.updateBundle),
  );

  /**
   * @openapi
   * /api/v1/admin/vehicles:
   *   post:
   *     tags: [Admin]
   *     summary: Add a vehicle
   *     security: [{ consoleAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The vehicle record, including its per-km rate." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.post('/vehicles', validate({ body: vehicleCreateSchema }), asyncHandler(controller.createVehicle));
  /**
   * @openapi
   * /api/v1/admin/vehicles/{id}:
   *   put:
   *     tags: [Admin]
   *     summary: Update a vehicle
   *     security: [{ consoleAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *         description: The vehicle.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The changed fields." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.put(
    '/vehicles/:id',
    validate({ params: idParamsSchema, body: vehicleUpdateSchema }),
    asyncHandler(controller.updateVehicle),
  );

  /**
   * @openapi
   * /api/v1/admin/activities:
   *   post:
   *     tags: [Admin]
   *     summary: Add an activity
   *     security: [{ consoleAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The activity record." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.post(
    '/activities',
    validate({ body: activityCreateSchema }),
    asyncHandler(controller.createActivity),
  );
  /**
   * @openapi
   * /api/v1/admin/activities/{kind}/{id}:
   *   put:
   *     tags: [Admin]
   *     summary: Update an activity
   *     description: Activities are stored per kind, so the kind is part of the address, not a field.
   *     security: [{ consoleAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: kind
   *         required: true
   *         schema: { type: string }
   *         description: Which activity collection it lives in.
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *         description: The activity.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The changed fields." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.put(
    '/activities/:kind/:id',
    validate({ params: activityParamsSchema, body: activityUpdateSchema }),
    asyncHandler(controller.updateActivity),
  );

  return router;
}
