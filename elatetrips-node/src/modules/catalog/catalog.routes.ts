import { Router } from 'express';
import type { CatalogController } from './catalog.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import {
  hotelListQuerySchema,
  activityQuerySchema,
  productQuerySchema,
  idParamSchema,
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
  router.get(
    '/hotels/:id',
    validate({ params: idParamSchema }),
    asyncHandler(controller.hotelById),
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
  router.get('/celebrations', asyncHandler(controller.celebrations));

  /**
   * @openapi
   * /api/v1/catalog/packages:
   *   get:
   *     tags: [Catalog]
   *     summary: List celebration packages with prices and inclusions
   *     responses:
   *       200: { description: Packages }
   */
  router.get('/packages', asyncHandler(controller.packages));

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
  router.get('/shops', asyncHandler(controller.shopCatalogs));

  return router;
}
