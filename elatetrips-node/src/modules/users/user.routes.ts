import { Router, type RequestHandler } from 'express';
import type { UserController } from './user.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import { updateProfileSchema } from './user.validation';

/**
 * @openapi
 * tags:
 *   - name: Users
 *     description: The signed-in user's profile and billing details.
 */
export function buildUserRouter(controller: UserController, authGuard: RequestHandler): Router {
  const router = Router();
  router.use(authGuard); // all profile routes require a valid JWT

  /**
   * @openapi
   * /api/v1/users/me:
   *   get:
   *     tags: [Users]
   *     summary: Get the signed-in user's profile
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: User profile }
   *       401: { description: Unauthorized }
   */
  router.get('/me', asyncHandler(controller.me));

  /**
   * @openapi
   * /api/v1/users/me:
   *   patch:
   *     tags: [Users]
   *     summary: Update contact and billing details
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name: { type: string }
   *               email: { type: string }
   *               billing:
   *                 type: object
   *                 properties:
   *                   name: { type: string }
   *                   email: { type: string }
   *                   address: { type: string }
   *                   city: { type: string }
   *                   pin: { type: string }
   *                   gst: { type: string }
   *     responses:
   *       200: { description: Updated profile }
   *       401: { description: Unauthorized }
   */
  router.patch('/me', validate({ body: updateProfileSchema }), asyncHandler(controller.updateMe));

  return router;
}
