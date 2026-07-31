/**
 * Orders module — HTTP route table (mounted at /api/v1/orders by src/routes/index.ts).
 *
 * Maps each URL to an OrderController method and the middleware that runs before
 * it. authGuard is applied router-wide, so EVERY order endpoint requires a valid
 * JWT and operates only on the trips owned by the caller's mobile number.
 *
 * Per-route request pipeline:
 *   authGuard (router-wide)  ->  validate(schema)  ->  asyncHandler(controller.method)
 *   - validate() parses and REPLACES req.body/req.params with typed, defaulted
 *     data (common/middleware/validate), so the controller never re-checks shapes.
 *   - asyncHandler() routes any rejected promise to the central error middleware.
 * The @openapi blocks below double as the Swagger source for these same routes.
 */
import { Router, type RequestHandler } from 'express';
import type { OrderController } from './order.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import { createOrderSchema, tripIdParamSchema } from './order.validation';

/**
 * @openapi
 * tags:
 *   - name: Orders
 *     description: Confirmed trips (My orders), scoped to the signed-in number.
 */
export function buildOrderRouter(controller: OrderController, authGuard: RequestHandler): Router {
  const router = Router();
  router.use(authGuard); // bookings always belong to an authenticated user

  /**
   * @openapi
   * /api/v1/orders:
   *   post:
   *     tags: [Orders]
   *     summary: Confirm a booking (creates a unique trip id)
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [total, summary]
   *             properties:
   *               total: { type: number }
   *               contactName: { type: string }
   *               contactPhone: { type: string }
   *               contactEmail: { type: string }
   *               summary:
   *                 type: object
   *                 properties:
   *                   destination: { type: string }
   *                   dates: { type: string }
   *                   travellers: { type: string }
   *                   transportLabel: { type: string }
   *                   hotelLabel: { type: string }
   *                   preferredHotels: { type: array, items: { type: string }, maxItems: 3, description: "Properties the traveller asked for, best first" }
   *                   adventures: { type: array, items: { type: string } }
   *                   experiences: { type: array, items: { type: string } }
   *                   packages:
   *                     type: array
   *                     items:
   *                       type: object
   *                       properties:
   *                         celeb: { type: string }
   *                         names: { type: array, items: { type: string } }
   *     responses:
   *       201: { description: Created order with its trip id }
   *       401: { description: Unauthorized }
   */
  // POST /api/v1/orders -> controller.create. Body validated/defaulted by
  // createOrderSchema; the new trip id and owner phone are assigned server-side.
  router.post('/', validate({ body: createOrderSchema }), asyncHandler(controller.create));

  /**
   * @openapi
   * /api/v1/orders:
   *   get:
   *     tags: [Orders]
   *     summary: List the signed-in user's trips
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: Orders for this mobile number }
   *       401: { description: Unauthorized }
   */
  // GET /api/v1/orders -> controller.listMine. No input to validate; the result
  // is implicitly scoped to the phone on the JWT.
  router.get('/', asyncHandler(controller.listMine));

  /**
   * @openapi
   * /api/v1/orders/{tripId}:
   *   get:
   *     tags: [Orders]
   *     summary: Get one of the user's trips by id
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: tripId, required: true, schema: { type: string, example: "ELT-100001" } }
   *     responses:
   *       200: { description: Order }
   *       403: { description: Belongs to another account }
   *       404: { description: Not found }
   */
  // GET /api/v1/orders/:tripId -> controller.getOne. tripIdParamSchema enforces
  // the ELT-<number> format before lookup; the service then enforces ownership
  // (403 if the trip exists but belongs to another account).
  router.get(
    '/:tripId',
    validate({ params: tripIdParamSchema }),
    asyncHandler(controller.getOne),
  );

  return router;
}
