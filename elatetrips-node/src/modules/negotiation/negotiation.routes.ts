/**
 * Negotiation router (M13) — mounted under /api/v1/negotiation. Additive surface:
 * it collides with no existing route. The decision endpoint is the single call
 * M7 FR7.7 makes; the /rules/* endpoints are the admin-config surface (CRUD,
 * versioning, dry-run, rollback) that mirrors M14.
 *
 * Wiring pattern per route: router.<verb>(path, [validate({...})], asyncHandler(controller.method)).
 * validate() parses + REPLACES the request parts with typed data; asyncHandler()
 * forwards rejected promises to the central error middleware (422 on contract
 * failures, never a 500).
 */
import { Router } from 'express';
import type { NegotiationController } from './negotiation.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import {
  decideBodySchema,
  publishBodySchema,
  dryRunBodySchema,
  rollbackBodySchema,
  versionParamSchema,
  activeQuerySchema,
  eventsQuerySchema,
} from './negotiation.validation';

/**
 * @openapi
 * tags:
 *   - name: Negotiation
 *     description: M13 rule-driven negotiation decisions + admin rule configuration (BR-16).
 */
export function buildNegotiationRouter(controller: NegotiationController): Router {
  const router = Router();

  /**
   * @openapi
   * /api/v1/negotiation/decide:
   *   post:
   *     tags: [Negotiation]
   *     summary: Decide the economics of one negotiation step (rule-driven, BR-16)
   *     description: >
   *       The pure rule engine decides whether to counter, the counter amount, or
   *       to stop — from the quote, the customer's optional target, a benchmark
   *       band and the round number. Emits `negotiation.round` with the
   *       engine-computed amount when it counters; the message text is drafted by
   *       an LLM elsewhere.
   *     responses:
   *       200: { description: Decision (action, counter_amount?, rule_id, rationale) }
   */
  router.post('/decide', validate({ body: decideBodySchema }), asyncHandler(controller.decide));

  /**
   * @openapi
   * /api/v1/negotiation/config:
   *   get:
   *     tags: [Negotiation]
   *     summary: Effective negotiation config (BR-17)
   *     responses:
   *       200: { description: Config (max_rounds, default_action, fairness floor, seed) }
   */
  router.get('/config', asyncHandler(controller.getConfig));

  /**
   * @openapi
   * /api/v1/negotiation/rules:
   *   get:
   *     tags: [Negotiation]
   *     summary: The rule set effective at an instant (default now)
   *     parameters:
   *       - { in: query, name: at, schema: { type: string }, description: "ISO instant; effective-dating resolves the version" }
   *     responses:
   *       200: { description: Active RuleSetVersion or null }
   */
  router.get('/rules', validate({ query: activeQuerySchema }), asyncHandler(controller.activeRules));

  /**
   * @openapi
   * /api/v1/negotiation/rules/versions:
   *   get:
   *     tags: [Negotiation]
   *     summary: Full version history (append-only)
   *     responses:
   *       200: { description: RuleSetVersion[] }
   */
  router.get('/rules/versions', asyncHandler(controller.listVersions));

  /**
   * @openapi
   * /api/v1/negotiation/rules/versions/{version}:
   *   get:
   *     tags: [Negotiation]
   *     summary: One stored version
   *     parameters:
   *       - { in: path, name: version, required: true, schema: { type: integer } }
   *     responses:
   *       200: { description: RuleSetVersion }
   *       404: { description: Not found }
   */
  router.get(
    '/rules/versions/:version',
    validate({ params: versionParamSchema }),
    asyncHandler(controller.getVersion),
  );

  /**
   * @openapi
   * /api/v1/negotiation/rules/dry-run:
   *   post:
   *     tags: [Negotiation]
   *     summary: Replay a candidate rule set over the historical corpus (FR13.5)
   *     description: Reports counters, concession, dead and shadowed rules, and delta vs. active. Returns a dry_run_id that unlocks publishing this exact candidate.
   *     responses:
   *       200: { description: DryRunReport }
   */
  router.post('/rules/dry-run', validate({ body: dryRunBodySchema }), asyncHandler(controller.dryRun));

  /**
   * @openapi
   * /api/v1/negotiation/rules/rollback:
   *   post:
   *     tags: [Negotiation]
   *     summary: One-click rollback — republish a prior version verbatim (FR13.4)
   *     responses:
   *       201: { description: The new RuleSetVersion restoring prior behaviour }
   *       404: { description: Target version not found }
   */
  router.post('/rules/rollback', validate({ body: rollbackBodySchema }), asyncHandler(controller.rollback));

  /**
   * @openapi
   * /api/v1/negotiation/rules:
   *   post:
   *     tags: [Negotiation]
   *     summary: Publish a new rule-set version (price rules require a matching dry-run)
   *     responses:
   *       201: { description: The published RuleSetVersion }
   *       422: { description: Price rules published without a matching dry-run (FR13.5) }
   */
  router.post('/rules', validate({ body: publishBodySchema }), asyncHandler(controller.publish));

  /**
   * @openapi
   * /api/v1/negotiation/events:
   *   get:
   *     tags: [Negotiation]
   *     summary: Negotiation audit trail
   *     parameters:
   *       - { in: query, name: quote_id, schema: { type: string } }
   *       - { in: query, name: type, schema: { type: string, enum: [negotiation.round, rule.evaluated, rule.published, rule.rolled_back] } }
   *     responses:
   *       200: { description: Audit events }
   */
  router.get('/events', validate({ query: eventsQuerySchema }), asyncHandler(controller.events));

  return router;
}
