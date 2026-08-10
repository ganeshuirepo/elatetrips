/**
 * Support module — HTTP route table (mounted at /api/v1/support).
 *
 * Three audiences share the prefix:
 *   /support/trips/*   guest thread — authGuard, scoped to the caller's phone
 *   /support/vendor/*  crew app     — console login, role 'crew'
 *   /support/ops/*     CM/OM console — console login, roles 'cm'/'om'
 *   /support/stream    SSE feed all three subscribe to
 *
 * All three identities are verified tokens (user JWT or console JWT with the
 * matching role); the acting row comes from the token's claims, never from a
 * client-supplied header. Accounts are seeded per support staff/vendor —
 * login via POST /console/login.
 */
import { Router, type RequestHandler } from 'express';
import type { SupportController } from './support.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import { consoleGuard } from '../admin/console.guard';
import {
  opsMessageSchema,
  photoDecisionSchema,
  photoReviewSchema,
  supportMessageSchema,
  supportPrefSchema,
  taskUpdateSchema,
  ticketActionSchema,
} from './support.validation';

export function buildSupportRouter(controller: SupportController, authGuard: RequestHandler): Router {
  const router = Router();

  // Real-time feed + mock directories (role pickers) — no auth by design.
  router.get('/stream', controller.stream);
  router.get('/staff', asyncHandler(controller.staff));
  router.get('/vendors', asyncHandler(controller.vendors));

  // Guest thread — owned by the signed-in number.
  router.get('/trips/:tripId', authGuard, asyncHandler(controller.thread));
  router.post(
    '/trips/:tripId/messages',
    authGuard,
    validate({ body: supportMessageSchema }),
    asyncHandler(controller.message),
  );
  router.patch(
    '/trips/:tripId/pref',
    authGuard,
    validate({ body: supportPrefSchema }),
    asyncHandler(controller.pref),
  );
  router.post(
    '/trips/:tripId/photo-decision',
    authGuard,
    validate({ body: photoDecisionSchema }),
    asyncHandler(controller.photoDecision),
  );

  // Vendor crew app — every route needs a signed-in crew account.
  const crewOnly = consoleGuard('crew');
  router.get('/vendor/tasks', crewOnly, asyncHandler(controller.vendorTasks));
  router.patch(
    '/vendor/tasks/:milestoneId',
    crewOnly,
    validate({ body: taskUpdateSchema }),
    asyncHandler(controller.updateTask),
  );
  router.get('/vendor/trips/:tripId/notes', crewOnly, asyncHandler(controller.vendorNotes));
  router.post(
    '/vendor/trips/:tripId/notes',
    crewOnly,
    validate({ body: supportMessageSchema }),
    asyncHandler(controller.vendorNote),
  );

  // Ops console (CM board + OM tickets) — managers only.
  const opsOnly = consoleGuard('cm', 'om');
  router.get('/ops/board', opsOnly, asyncHandler(controller.board));
  router.get('/ops/tickets', opsOnly, asyncHandler(controller.tickets));
  router.patch(
    '/ops/tickets/:ticketId',
    opsOnly,
    validate({ body: ticketActionSchema }),
    asyncHandler(controller.ticketAction),
  );
  router.post(
    '/ops/milestones/:milestoneId/photo-review',
    opsOnly,
    validate({ body: photoReviewSchema }),
    asyncHandler(controller.reviewPhoto),
  );
  router.post('/ops/milestones/:milestoneId/replace-vendor', opsOnly, asyncHandler(controller.replaceVendor));
  // A manager's view of one booking: full thread (internal included) + composer.
  router.get('/ops/trips/:tripId/thread', opsOnly, asyncHandler(controller.opsThread));
  router.post(
    '/ops/trips/:tripId/messages',
    opsOnly,
    validate({ body: opsMessageSchema }),
    asyncHandler(controller.opsMessage),
  );

  return router;
}
