import { Router } from 'express';
import type { ExperiencesController } from './experiences.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import {
  classificationQuerySchema,
  festivalQuerySchema,
  planQuerySchema,
} from './experiences.validation';

/**
 * @openapi
 * tags:
 *   - name: Experiences
 *     description: >
 *       The Experiences catalog, imported from the web repo's export
 *       (`npm run export:experiences` → `npm run import:experiences`). Public
 *       content: no auth, strong ETag, five-minute cache. Authored in one place
 *       and served here so the web and the Flutter app read the same catalog.
 */
export function buildExperiencesRouter(controller: ExperiencesController): Router {
  const router = Router();

  /**
   * @openapi
   * /api/v1/experiences/version:
   *   get:
   *     tags: [Experiences]
   *     summary: The active catalog revision — the cheap revalidation ping
   *     responses:
   *       200: { description: schemaVersion, revision and activation time }
   *       304: { description: Client already has this revision }
   */
  router.get('/version', asyncHandler(controller.version));

  /**
   * @openapi
   * /api/v1/experiences/bundle:
   *   get:
   *     tags: [Experiences]
   *     summary: Everything, in one document — the call a phone makes on boot
   *     responses:
   *       200: { description: catalog + plans + revision }
   *       304: { description: Client already has this revision }
   */
  router.get('/bundle', asyncHandler(controller.bundle));

  /**
   * @openapi
   * /api/v1/experiences/catalog:
   *   get:
   *     tags: [Experiences]
   *     summary: The whole Experiences catalog in one response
   *     description: >-
   *       Imported from the web repo's committed fixtures, not authored here. Regenerate with
   *       npm run export:experiences there, then npm run import:experiences here.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   */
  router.get('/catalog', asyncHandler(controller.catalog));
  /**
   * @openapi
   * /api/v1/experiences/plans:
   *   get:
   *     tags: [Experiences]
   *     summary: The day-by-day plans for every occasion
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   */
  router.get('/plans', asyncHandler(controller.plans));

  /**
   * @openapi
   * /api/v1/experiences/occasions:
   *   get:
   *     tags: [Experiences]
   *     summary: Occasion tiles, optionally for one classification
   *     parameters:
   *       - in: query
   *         name: classification
   *         schema: { type: string, enum: [celebration, festival, recreation, pilgrimage] }
   *     responses:
   *       200: { description: Occasion tiles }
   */
  router.get(
    '/occasions',
    validate({ query: classificationQuerySchema }),
    asyncHandler(controller.occasions),
  );

  /**
   * @openapi
   * /api/v1/experiences/festivals:
   *   get:
   *     tags: [Experiences]
   *     summary: Festivals whose window intersects the range
   *     parameters:
   *       - { in: query, name: from, schema: { type: string, format: date } }
   *       - { in: query, name: to, schema: { type: string, format: date } }
   *     responses:
   *       200: { description: Festivals }
   */
  router.get('/festivals', validate({ query: festivalQuerySchema }), asyncHandler(controller.festivals));

  /**
   * @openapi
   * /api/v1/experiences/destinations:
   *   get:
   *     tags: [Experiences]
   *     summary: Destinations, with the ones worth showing first flagged
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   */
  router.get('/destinations', asyncHandler(controller.destinations));
  /**
   * @openapi
   * /api/v1/experiences/sections:
   *   get:
   *     tags: [Experiences]
   *     summary: The customizable sections for a trip type, with their tiers
   *     parameters:
   *       - in: query
   *         name: classification
   *         schema: { type: string }
   *         description: celebration · festival · recreation · pilgrimage.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.get('/sections', validate({ query: classificationQuerySchema }), asyncHandler(controller.sections));
  /**
   * @openapi
   * /api/v1/experiences/addons:
   *   get:
   *     tags: [Experiences]
   *     summary: The add-on experiences offered for a trip type
   *     parameters:
   *       - in: query
   *         name: classification
   *         schema: { type: string }
   *         description: celebration · festival · recreation · pilgrimage.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.get('/addons', validate({ query: classificationQuerySchema }), asyncHandler(controller.addons));
  /**
   * @openapi
   * /api/v1/experiences/transport:
   *   get:
   *     tags: [Experiences]
   *     summary: Vehicles and their per-km rates
   *     description: Transport prices by distance and party size, not by tier — the shape here reflects that.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   */
  router.get('/transport', asyncHandler(controller.transport));

  /**
   * @openapi
   * /api/v1/experiences/plan:
   *   get:
   *     tags: [Experiences]
   *     summary: The fixed day plan for an occasion (null when it has none)
   *     parameters:
   *       - { in: query, name: occasion, required: true, schema: { type: string } }
   *     responses:
   *       200: { description: Day plan, or null }
   */
  router.get('/plan', validate({ query: planQuerySchema }), asyncHandler(controller.plan));

  return router;
}
