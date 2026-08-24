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
import { Router } from 'express';
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
  updateSupplierBodySchema,
} from './supplier.validation';

export function buildSupplierRouter(c: SupplierController): Router {
  const router = Router();

  // ---- reads ----
  // FR3.8 candidate query — registered BEFORE '/:id' so "candidates" is not
  // captured as an id.
  router.get('/candidates', validate({ query: candidateQuerySchema }), asyncHandler(c.candidates));
  // Public directory (contracts/api.md GET /api/v1/suppliers).
  router.get('/', validate({ query: directoryQuerySchema }), asyncHandler(c.directory));
  router.get('/:id/audit', validate({ params: idParamSchema }), asyncHandler(c.auditTrail));
  router.get('/:id', validate({ params: idParamSchema }), asyncHandler(c.getOne));

  // ---- writes (onboarding lifecycle) ----
  router.post('/', validate({ body: createSupplierBodySchema }), asyncHandler(c.create));
  router.patch('/:id', validate({ params: idParamSchema, body: updateSupplierBodySchema }), asyncHandler(c.update));
  router.post('/:id/tat', validate({ params: idParamSchema, body: declareTatBodySchema }), asyncHandler(c.declareTat));
  router.post('/:id/contract', validate({ params: idParamSchema, body: acceptContractBodySchema }), asyncHandler(c.acceptContract));
  router.post('/:id/activate', validate({ params: idParamSchema }), asyncHandler(c.activate));
  router.post('/:id/bench', validate({ params: idParamSchema }), asyncHandler(c.bench));

  return router;
}
