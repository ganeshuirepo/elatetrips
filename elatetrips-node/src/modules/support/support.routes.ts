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
  /**
   * @openapi
   * /api/v1/support/stream:
   *   get:
   *     tags: [Support]
   *     summary: Server-sent events — a nudge to refetch, not the data itself
   *     description: >-
   *       Unauthenticated and signal-only by design: it carries no trip content, so a client
   *       refetches over the authenticated endpoints when an event arrives. Clients should
   *       also poll as a fallback, because a dropped stream is silent.
   *     responses:
   *       '200': { description: 'An event stream (text/event-stream).' }
   */
  router.get('/stream', controller.stream);
  /**
   * @openapi
   * /api/v1/support/staff:
   *   get:
   *     tags: [Support]
   *     summary: The staff directory behind the console role picker
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   */
  router.get('/staff', asyncHandler(controller.staff));
  /**
   * @openapi
   * /api/v1/support/vendors:
   *   get:
   *     tags: [Support]
   *     summary: The vendor directory — who can be assigned to a milestone
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   */
  router.get('/vendors', asyncHandler(controller.vendors));

  // Guest thread — owned by the signed-in number.
  /**
   * @openapi
   * /api/v1/support/trips/{tripId}:
   *   get:
   *     tags: [Support]
   *     summary: The guest's assistant thread for one trip
   *     description: Scoped to the signed-in number — a trip belonging to somebody else is not readable.
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: tripId
   *         required: true
   *         schema: { type: string }
   *         description: The trip.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.get('/trips/:tripId', authGuard, asyncHandler(controller.thread));
  /**
   * @openapi
   * /api/v1/support/trips/{tripId}/messages:
   *   post:
   *     tags: [Support]
   *     summary: The guest asks a question
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: tripId
   *         required: true
   *         schema: { type: string }
   *         description: The trip.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               text: { type: string, description: "What the guest wrote." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.post(
    '/trips/:tripId/messages',
    authGuard,
    validate({ body: supportMessageSchema }),
    asyncHandler(controller.message),
  );
  /**
   * @openapi
   * /api/v1/support/trips/{tripId}/pref:
   *   patch:
   *     tags: [Support]
   *     summary: How much the guest wants to be told
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: tripId
   *         required: true
   *         schema: { type: string }
   *         description: The trip.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               pref: { type: string, enum: [everything, handled], description: "everything = every update; handled = only what needs them." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.patch(
    '/trips/:tripId/pref',
    authGuard,
    validate({ body: supportPrefSchema }),
    asyncHandler(controller.pref),
  );
  /**
   * @openapi
   * /api/v1/support/trips/{tripId}/photo-decision:
   *   post:
   *     tags: [Support]
   *     summary: The guest approves a set-up photograph, or asks for a change
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: tripId
   *         required: true
   *         schema: { type: string }
   *         description: The trip.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The decision: which milestone, approve or change, and a structured reason when it is a change." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.post(
    '/trips/:tripId/photo-decision',
    authGuard,
    validate({ body: photoDecisionSchema }),
    asyncHandler(controller.photoDecision),
  );

  // Vendor crew app — every route needs a signed-in crew account.
  const crewOnly = consoleGuard('crew');
  /**
   * @openapi
   * /api/v1/support/vendor/tasks:
   *   get:
   *     tags: [Support]
   *     summary: The crew member's task list
   *     description: Console token, crew role.
   *     security: [{ consoleAuth: [] }]
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.get('/vendor/tasks', crewOnly, asyncHandler(controller.vendorTasks));
  /**
   * @openapi
   * /api/v1/support/vendor/tasks/{milestoneId}:
   *   patch:
   *     tags: [Support]
   *     summary: Crew moves a milestone on — scheduled, en route, in progress, complete, delayed
   *     description: >-
   *       A photograph is attached as a URL: there is a separate upload endpoint, and this
   *       route takes the result of it rather than the file.
   *     security: [{ consoleAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: milestoneId
   *         required: true
   *         schema: { type: string }
   *         description: The milestone being worked.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The new state, an ETA when declaring a delay, and an optional photoUrl." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.patch(
    '/vendor/tasks/:milestoneId',
    crewOnly,
    validate({ body: taskUpdateSchema }),
    asyncHandler(controller.updateTask),
  );
  /**
   * @openapi
   * /api/v1/support/vendor/trips/{tripId}/notes:
   *   get:
   *     tags: [Support]
   *     summary: Internal notes on a trip — crew and managers only, never the guest
   *     security: [{ consoleAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: tripId
   *         required: true
   *         schema: { type: string }
   *         description: The trip.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.get('/vendor/trips/:tripId/notes', crewOnly, asyncHandler(controller.vendorNotes));
  /**
   * @openapi
   * /api/v1/support/vendor/trips/{tripId}/notes:
   *   post:
   *     tags: [Support]
   *     summary: Crew leaves an internal note
   *     security: [{ consoleAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: tripId
   *         required: true
   *         schema: { type: string }
   *         description: The trip.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               text: { type: string }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.post(
    '/vendor/trips/:tripId/notes',
    crewOnly,
    validate({ body: supportMessageSchema }),
    asyncHandler(controller.vendorNote),
  );

  // Ops console (CM board + OM tickets) — managers only.
  const opsOnly = consoleGuard('cm', 'om');
  /**
   * @openapi
   * /api/v1/support/ops/board:
   *   get:
   *     tags: [Support]
   *     summary: The ops board — every live trip and its health
   *     security: [{ consoleAuth: [] }]
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.get('/ops/board', opsOnly, asyncHandler(controller.board));
  /**
   * @openapi
   * /api/v1/support/ops/tickets:
   *   get:
   *     tags: [Support]
   *     summary: The escalation queue
   *     security: [{ consoleAuth: [] }]
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.get('/ops/tickets', opsOnly, asyncHandler(controller.tickets));
  /**
   * @openapi
   * /api/v1/support/ops/tickets/{ticketId}:
   *   patch:
   *     tags: [Support]
   *     summary: Acknowledge or resolve a ticket
   *     security: [{ consoleAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: ticketId
   *         required: true
   *         schema: { type: string }
   *         description: The ticket.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               action: { type: string, enum: [ack, resolve] }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.patch(
    '/ops/tickets/:ticketId',
    opsOnly,
    validate({ body: ticketActionSchema }),
    asyncHandler(controller.ticketAction),
  );
  /**
   * @openapi
   * /api/v1/support/ops/milestones/{milestoneId}/photo-review:
   *   post:
   *     tags: [Support]
   *     summary: A manager reviews a crew photograph before the guest sees it
   *     security: [{ consoleAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: milestoneId
   *         required: true
   *         schema: { type: string }
   *         description: The milestone the photograph belongs to.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The verdict and, when it is a rejection, what has to change." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.post(
    '/ops/milestones/:milestoneId/photo-review',
    opsOnly,
    validate({ body: photoReviewSchema }),
    asyncHandler(controller.reviewPhoto),
  );
  /**
   * @openapi
   * /api/v1/support/ops/milestones/{milestoneId}/replace-vendor:
   *   post:
   *     tags: [Support]
   *     summary: Swap the vendor on a milestone that is not going to happen
   *     security: [{ consoleAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: milestoneId
   *         required: true
   *         schema: { type: string }
   *         description: The milestone to reassign.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.post('/ops/milestones/:milestoneId/replace-vendor', opsOnly, asyncHandler(controller.replaceVendor));
  // A manager's view of one booking: full thread (internal included) + composer.
  /**
   * @openapi
   * /api/v1/support/ops/trips/{tripId}/thread:
   *   get:
   *     tags: [Support]
   *     summary: A manager's view of one booking — the whole thread, internal notes included
   *     security: [{ consoleAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: tripId
   *         required: true
   *         schema: { type: string }
   *         description: The trip.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.get('/ops/trips/:tripId/thread', opsOnly, asyncHandler(controller.opsThread));
  /**
   * @openapi
   * /api/v1/support/ops/trips/{tripId}/messages:
   *   post:
   *     tags: [Support]
   *     summary: A manager writes into the thread
   *     description: >-
   *       `internal` decides whether the guest ever sees it. Getting that flag wrong is the
   *       expensive mistake on this endpoint, so it is required rather than defaulted.
   *     security: [{ consoleAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: tripId
   *         required: true
   *         schema: { type: string }
   *         description: The trip.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               text: { type: string }
   *               internal: { type: boolean, description: "true keeps it off the guest's screen." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '401': { $ref: '#/components/responses/Unauthorized' }
   */
  router.post(
    '/ops/trips/:tripId/messages',
    opsOnly,
    validate({ body: opsMessageSchema }),
    asyncHandler(controller.opsMessage),
  );

  return router;
}
