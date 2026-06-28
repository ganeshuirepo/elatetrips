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
  router.get(
    '/:tripId',
    validate({ params: tripIdParamSchema }),
    asyncHandler(controller.getOne),
  );

  return router;
}
