/**
 * Supplier router (M3), mounted at /api/v1/suppliers. This is the write + read
 * surface for the supplier directory, onboarding, tiering and cap policy.
 *
 * Note on `GET /suppliers` (root): this router intentionally OWNS the directory
 * listing. It is registered before the additive 006 contracts router in
 * routes/index.ts, so the documented `GET /api/v1/suppliers?destination=&track=`
 * (contracts/api.md) resolves here — the richer M3 implementation — while every
 * other contracts route still falls through untouched.
 *
 * Wiring per route: router.<verb>(path, validate({...}), asyncHandler(handler)),
 * exactly the catalog pattern.
 */
import { Router, type RequestHandler } from 'express';
import type { SupplierController } from './supplier.controller';
import { asyncHandler } from '../../common/http/asyncHandler';
import { validate } from '../../common/middleware/validate';
import {
  acceptContractBodySchema,
  candidateQuerySchema,
  createSupplierBodySchema,
  declareTatBodySchema,
  directoryQuerySchema,
  idParamSchema,
  provisionSupplierBodySchema,
  updateSupplierBodySchema,
} from './supplier.validation';

/**
 * The partner directory (M3). EVERY route sits behind `guard` (applied once via
 * router.use) — the admin guard, because this is ops tooling: it lists every
 * partner, and its writes create, amend, activate and bench them.
 *
 * It used to be entirely public. Validation was in place on all ten routes, so
 * the shape of every request was checked — but nothing checked WHO was asking,
 * and this module persists to MongoDB rather than to the in-memory contract
 * engine. An anonymous caller could read the whole supplier list or add one.
 *
 * Nothing in the web or mobile clients calls these endpoints, so closing them
 * breaks no caller; an ops surface that needs them already holds an admin
 * console token, which this guard accepts.
 */
export function buildSupplierRouter(c: SupplierController, guard: RequestHandler): Router {
  const router = Router();
  router.use(guard);

  // ---- reads ----
  // FR3.8 candidate query — registered BEFORE '/:id' so "candidates" is not
  // captured as an id.
  /**
   * @openapi
   * /api/v1/suppliers/candidates:
   *   get:
   *     tags: [Suppliers]
   *     summary: Suppliers eligible for a request, ranked
   *     description: The list a broadcast wave is drawn from — matched on destination, track and capability.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.get('/candidates', validate({ query: candidateQuerySchema }), asyncHandler(c.candidates));
  // Public directory (contracts/api.md GET /api/v1/suppliers).
  /**
   * @openapi
   * /api/v1/suppliers:
   *   get:
   *     tags: [Suppliers, Contracts]
   *     summary: The supplier directory
   *     description: >-
   *       Also answers the contracts surface's GET /suppliers: this router is mounted
   *       before the contracts catch-all, so this is the route that runs.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.get('/', validate({ query: directoryQuerySchema }), asyncHandler(c.directory));
  /**
   * @openapi
   * /api/v1/suppliers/{id}/audit:
   *   get:
   *     tags: [Suppliers]
   *     summary: Everything that has happened to this supplier record (BR-6)
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *         description: The supplier.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.get('/:id/audit', validate({ params: idParamSchema }), asyncHandler(c.auditTrail));
  /**
   * @openapi
   * /api/v1/suppliers/{id}:
   *   get:
   *     tags: [Suppliers]
   *     summary: One supplier
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *         description: The supplier.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   *       '404': { $ref: '#/components/responses/NotFound' }
   */
  router.get('/:id', validate({ params: idParamSchema }), asyncHandler(c.getOne));

  // ---- writes (onboarding lifecycle) ----
  /**
   * @openapi
   * /api/v1/suppliers:
   *   post:
   *     tags: [Suppliers]
   *     summary: Register a supplier
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The supplier record — name, contacts, destinations, capabilities." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/', validate({ body: createSupplierBodySchema }), asyncHandler(c.create));
  /**
   * @openapi
   * /api/v1/suppliers/provision:
   *   post:
   *     tags: [Suppliers]
   *     summary: Turn a completed partner registration into a supplier
   *     description: >-
   *       Mints the canonical supplier_id — the caller does not supply one. Idempotent
   *       on external_ref (the onboarding system's own id for the same partner), so a
   *       retried registration resolves to the same supplier instead of a duplicate:
   *       201 when this call created it, 200 when it matched an existing one.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "external_ref, name, type, track, destinations, declared turnaround." }
   *     responses:
   *       '201': { $ref: '#/components/responses/Ok' }
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/provision', validate({ body: provisionSupplierBodySchema }), asyncHandler(c.provision));
  /**
   * @openapi
   * /api/v1/suppliers/{id}:
   *   patch:
   *     tags: [Suppliers]
   *     summary: Amend a supplier
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *         description: The supplier.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "Only the fields being changed." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.patch('/:id', validate({ params: idParamSchema, body: updateSupplierBodySchema }), asyncHandler(c.update));
  /**
   * @openapi
   * /api/v1/suppliers/{id}/tat:
   *   post:
   *     tags: [Suppliers]
   *     summary: A supplier declares their turnaround time
   *     description: What they promise to answer a request within — it is what the routing then holds them to.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *         description: The supplier.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The declared turnaround." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/:id/tat', validate({ params: idParamSchema, body: declareTatBodySchema }), asyncHandler(c.declareTat));
  /**
   * @openapi
   * /api/v1/suppliers/{id}/contract:
   *   post:
   *     tags: [Suppliers]
   *     summary: Record a supplier accepting the contract
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *         description: The supplier.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, description: "The acceptance — version and timestamp." }
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/:id/contract', validate({ params: idParamSchema, body: acceptContractBodySchema }), asyncHandler(c.acceptContract));
  /**
   * @openapi
   * /api/v1/suppliers/{id}/activate:
   *   post:
   *     tags: [Suppliers]
   *     summary: Put a supplier into rotation
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *         description: The supplier.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/:id/activate', validate({ params: idParamSchema }), asyncHandler(c.activate));
  /**
   * @openapi
   * /api/v1/suppliers/{id}/bench:
   *   post:
   *     tags: [Suppliers]
   *     summary: Bench a supplier — kept on file, not sent requests
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *         description: The supplier.
   *     responses:
   *       '200': { $ref: '#/components/responses/Ok' }
   *       '422': { $ref: '#/components/responses/BadRequest' }
   */
  router.post('/:id/bench', validate({ params: idParamSchema }), asyncHandler(c.bench));

  return router;
}
