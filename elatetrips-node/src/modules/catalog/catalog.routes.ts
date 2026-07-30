/**
 * Catalog router — read-only reference-data endpoints mounted under
 * /api/v1/catalog. This is the entry point of the request path for the module.
 *
 * Wiring pattern for every route below:
 *   router.<verb>(path, [validate({...})], asyncHandler(controller.method))
 *   - validate(): parses + coerces params/query/body with the Zod schemas from
 *     catalog.validation and REPLACES those req parts, so the controller reads
 *     clean, typed data (see common/middleware/validate).
 *   - asyncHandler(): forwards a rejected promise to Express error middleware
 *     instead of crashing the process (see common/http/asyncHandler).
 *   - controller.method: the matching CatalogController handler.
 * The @openapi blocks document each endpoint's URL, params and responses; the
 * short inline note on each route adds what the doc block omits — the exact
 * controller method and which schema (if any) guards it.
 */
import { Router } from 'express';
import type { CatalogController } from './catalog.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import {
  hotelListQuerySchema,
  activityQuerySchema,
  bundleQuerySchema,
  productQuerySchema,
  idParamSchema,
  availabilityBodySchema,
  experienceFacetQuerySchema,
} from './catalog.validation';

/**
 * @openapi
 * tags:
 *   - name: Catalog
 *     description: Read-only reference data (destinations, hotels, packages, shop).
 */
export function buildCatalogRouter(controller: CatalogController): Router {
  const router = Router();

  /**
   * @openapi
   * /api/v1/catalog/destinations:
   *   get:
   *     tags: [Catalog]
   *     summary: List destinations
   *     responses:
   *       200: { description: Destinations }
   */
  // → CatalogController.destinations — no input validation (no request params).
  router.get('/destinations', asyncHandler(controller.destinations));

  /**
   * @openapi
   * /api/v1/catalog/vehicles:
   *   get:
   *     tags: [Catalog]
   *     summary: List cab vehicle types
   *     responses:
   *       200: { description: Vehicles }
   */
  // → CatalogController.vehicles — no input validation.
  router.get('/vehicles', asyncHandler(controller.vehicles));

  /**
   * @openapi
   * /api/v1/catalog/rooms:
   *   get:
   *     tags: [Catalog]
   *     summary: List room types and metadata
   *     responses:
   *       200: { description: Rooms }
   */
  // → CatalogController.rooms — no input validation.
  router.get('/rooms', asyncHandler(controller.rooms));

  /**
   * @openapi
   * /api/v1/catalog/hotels:
   *   get:
   *     tags: [Catalog]
   *     summary: List hotels (filterable)
   *     parameters:
   *       - { in: query, name: stars, schema: { type: string }, description: "CSV of star ratings, e.g. 3,4,5" }
   *       - { in: query, name: types, schema: { type: string }, description: "CSV of property types" }
   *       - { in: query, name: amenities, schema: { type: string }, description: "CSV; hotel must have ALL" }
   *       - { in: query, name: activities, schema: { type: string }, description: "CSV; hotel must have ALL" }
   *       - { in: query, name: roomSizes, schema: { type: string } }
   *       - { in: query, name: views, schema: { type: string } }
   *       - { in: query, name: climate, schema: { type: string } }
   *       - { in: query, name: maxPrice, schema: { type: number }, description: "Upper nightly price bound" }
   *     responses:
   *       200: { description: Filtered hotel list }
   */
  // → CatalogController.hotels — validates query with hotelListQuerySchema
  //   (CSV params become string[]/number[], maxPrice coerced to a number).
  router.get('/hotels', validate({ query: hotelListQuerySchema }), asyncHandler(controller.hotels));

  /**
   * @openapi
   * /api/v1/catalog/hotels/{id}:
   *   get:
   *     tags: [Catalog]
   *     summary: Get one hotel by id
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *     responses:
   *       200: { description: Hotel }
   *       404: { description: Not found }
   */
  // → CatalogController.hotelById — validates the :id path param (idParamSchema).
  //   Service throws NotFoundError (→ 404) when no hotel has that id.
  router.get(
    '/hotels/:id',
    validate({ params: idParamSchema }),
    asyncHandler(controller.hotelById),
  );

  /**
   * @openapi
   * /api/v1/catalog/hotels/{id}/availability:
   *   post:
   *     tags: [Catalog]
   *     summary: Confirm live room availability with the hotelier (holds the room briefly)
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [roomId, checkin, nights, rooms]
   *             properties:
   *               roomId: { type: string }
   *               checkin: { type: string, example: "2026-08-21" }
   *               nights: { type: integer, minimum: 1 }
   *               rooms: { type: integer, minimum: 1 }
   *     responses:
   *       200: { description: Availability result (holdRef + expiresAt when available) }
   *       404: { description: Hotel not found }
   */
  // → CatalogController.hotelAvailability — validates BOTH the :id param and the
  //   JSON body (availabilityBodySchema: roomId, checkin YYYY-MM-DD, nights, rooms).
  router.post(
    '/hotels/:id/availability',
    validate({ params: idParamSchema, body: availabilityBodySchema }),
    asyncHandler(controller.hotelAvailability),
  );

  /**
   * @openapi
   * /api/v1/catalog/hotel-options:
   *   get:
   *     tags: [Catalog]
   *     summary: Hotel filter options grouped by category
   *     responses:
   *       200: { description: Grouped option items }
   */
  // → CatalogController.hotelOptions — no validation; service groups options by category.
  router.get('/hotel-options', asyncHandler(controller.hotelOptions));

  /**
   * @openapi
   * /api/v1/catalog/celebrations:
   *   get:
   *     tags: [Catalog]
   *     summary: List celebrations and their offered package names
   *     responses:
   *       200: { description: Celebrations }
   */
  // → CatalogController.celebrations — no input validation.
  router.get('/celebrations', asyncHandler(controller.celebrations));

  /**
   * @openapi
   * /api/v1/catalog/experience-facets:
   *   get:
   *     tags: [Catalog]
   *     summary: Local-experience filters available for a place
   *     description: >
   *       Returns only the facets that packages at the given destinations
   *       actually offer — Goa yields water sports, Ooty yields treks. Omit
   *       `dest` for the full vocabulary.
   *     parameters:
   *       - { in: query, name: dest, schema: { type: string, example: "ooty,coorg" } }
   *     responses:
   *       200: { description: Facets with id, label, icon and tags }
   */
  // → CatalogController.experienceFacets — validates query (experienceFacetQuerySchema
  //   only bounds `dest` length; the controller splits the CSV into ids itself).
  /**
   * @openapi
   * /api/v1/catalog/package-options:
   *   get:
   *     tags: [Catalog]
   *     summary: Priced customization tiers for the plan page
   *     description: Decoration, star, room and cab groups; each tier carries a priceDelta.
   *     responses:
   *       200: { description: Tiers with id, group, label, note, priceDelta }
   */
  router.get('/package-options', asyncHandler(controller.packageOptions));

  router.get(
    '/experience-facets',
    validate({ query: experienceFacetQuerySchema }),
    asyncHandler(controller.experienceFacets),
  );

  /**
   * @openapi
   * /api/v1/catalog/package-filters:
   *   get:
   *     tags: [Catalog]
   *     summary: The whole filter bar for the packages screen
   *     description: >
   *       Every filter group with its chips, labels, icons, order and whether it
   *       is multi-select — so the client hardcodes none of them. Scoped by
   *       destination like experience-facets: a chip is offered only when a
   *       package there can satisfy it, and a group with nothing to offer is
   *       omitted. Each group carries a `match` kind ('occasion' | 'tags' |
   *       'cab') telling the client how to test a package against its chips.
   *     parameters:
   *       - { in: query, name: dest, schema: { type: string }, description: "CSV destination ids; omit for the full vocabulary" }
   *     responses:
   *       200: { description: Filter groups, each with chips }
   */
  router.get(
    '/package-filters',
    validate({ query: experienceFacetQuerySchema }),
    asyncHandler(controller.packageFilters),
  );

  /**
   * @openapi
   * /api/v1/catalog/packages:
   *   get:
   *     tags: [Catalog]
   *     summary: List celebration packages with prices and inclusions
   *     responses:
   *       200: { description: Packages }
   */
  // → CatalogController.packages — no input validation.
  router.get('/packages', asyncHandler(controller.packages));

  /**
   * @openapi
   * /api/v1/catalog/celebration-bundles:
   *   get:
   *     tags: [Catalog]
   *     summary: List complete celebration bundles (stay + food + setup)
   *     parameters:
   *       - { in: query, name: dest, schema: { type: string }, description: "Filter by destination id" }
   *     responses:
   *       200: { description: Celebration bundles }
   */
  // → CatalogController.celebrationBundles — validates query (bundleQuerySchema:
  //   optional `dest` filter, trimmed, 1–40 chars).
  router.get(
    '/celebration-bundles',
    validate({ query: bundleQuerySchema }),
    asyncHandler(controller.celebrationBundles),
  );

  /**
   * @openapi
   * /api/v1/catalog/activities:
   *   get:
   *     tags: [Catalog]
   *     summary: List adventures and experiences
   *     parameters:
   *       - { in: query, name: kind, schema: { type: string, enum: [adventure, experience] } }
   *     responses:
   *       200: { description: Activities }
   */
  // → CatalogController.activities — validates query (activityQuerySchema:
  //   optional kind ∈ {adventure, experience}).
  router.get(
    '/activities',
    validate({ query: activityQuerySchema }),
    asyncHandler(controller.activities),
  );

  /**
   * @openapi
   * /api/v1/catalog/products:
   *   get:
   *     tags: [Catalog]
   *     summary: List shop products (gifts / medical), filterable
   *     parameters:
   *       - { in: query, name: shop, schema: { type: string, enum: [gifts, medical] } }
   *       - { in: query, name: cat, schema: { type: string }, description: "Category id, e.g. flowers" }
   *       - { in: query, name: minPrice, schema: { type: number } }
   *       - { in: query, name: maxPrice, schema: { type: number } }
   *       - { in: query, name: minRating, schema: { type: number }, description: "0–5" }
   *     responses:
   *       200: { description: Filtered products }
   */
  // → CatalogController.products — validates query (productQuerySchema: shop, cat,
  //   min/maxPrice, minRating 0–5, all coerced and optional).
  router.get(
    '/products',
    validate({ query: productQuerySchema }),
    asyncHandler(controller.products),
  );

  /**
   * @openapi
   * /api/v1/catalog/shops:
   *   get:
   *     tags: [Catalog]
   *     summary: Shop catalogue metadata (titles + categories)
   *     responses:
   *       200: { description: Shop catalogs }
   */
  // → CatalogController.shopCatalogs — no input validation.
  router.get('/shops', asyncHandler(controller.shopCatalogs));

  return router;
}
