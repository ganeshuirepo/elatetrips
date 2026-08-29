import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/http/asyncHandler';
import { ok } from '../../common/http/ApiResponse';
import { validate } from '../../common/middleware/validate';
import { UnauthorizedError } from '../../common/errors/AppError';
import type { PushService } from './push.service';

const registerSchema = z.object({
  token: z.string().trim().min(10).max(4096),
  platform: z.enum(['android', 'ios']),
  // scope is derived from the credential, never trusted from the body.
});

const unregisterSchema = z.object({ token: z.string().trim().min(10).max(4096) });

/**
 * Device push-token registration (closes mobile-backlog gap #2). The owner is
 * whoever the bearer token says: a user JWT registers a guest device, a
 * console token a crew/manager device.
 *
 * @openapi
 * /api/v1/push/tokens:
 *   post:
 *     tags: [Push]
 *     summary: Register this device for push delivery
 */
export function buildPushRouter(service: PushService, identityGuard: RequestHandler): Router {
  const router = Router();

  router.post(
    '/tokens',
    identityGuard,
    validate({ body: registerSchema }),
    asyncHandler(async (req, res) => {
      const console_ = res.locals.console as { sub?: string } | undefined;
      const owner = req.user?.phone ?? console_?.sub;
      if (!owner) throw new UnauthorizedError('No identity on the request');
      const scope = req.user?.phone ? ('user' as const) : ('console' as const);
      return ok(res, await service.register(owner, scope, req.body.token, req.body.platform));
    }),
  );

  /**
   * @openapi
   * /api/v1/push/tokens:
   *   delete:
   *     tags: [Push]
   *     summary: Forget a device token
   *     description: >-
   *       Called on sign-out, so the next person holding the phone is not sent somebody
   *       else's trip. The token travels in the BODY, not the path — a device token in a
   *       URL ends up in access logs.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [token]
   *             properties:
   *               token: { type: string, description: "The device token to drop." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.delete(
    '/tokens',
    identityGuard,
    validate({ body: unregisterSchema }),
    asyncHandler(async (req, res) => ok(res, await service.unregister(req.body.token))),
  );

  return router;
}
