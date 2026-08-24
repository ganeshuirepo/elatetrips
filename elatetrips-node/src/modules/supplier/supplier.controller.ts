/**
 * SupplierController — the thin HTTP layer for /api/v1/suppliers. Each method
 * reads the already-validated request (the validate() middleware has parsed and
 * replaced params/query/body), delegates to SupplierService, and writes the
 * result through the shared `{ success, data }` envelope helpers. No business
 * logic lives here (Single Responsibility) — mirrors CatalogController.
 */
import type { Request, Response } from 'express';
import { created, ok } from '../../common/http/ApiResponse';
import type { SupplierService } from './supplier.service';
import type {
  CandidateQuery,
  ContractAcceptance,
  CreateSupplierInput,
  UpdateSupplierInput,
} from './supplier.types';

export class SupplierController {
  constructor(private readonly service: SupplierService) {}

  /** POST /suppliers — invite/create a supplier. */
  create = async (req: Request, res: Response): Promise<Response> =>
    created(res, await this.service.invite(req.body as CreateSupplierInput));

  /** GET /suppliers — public directory (contract view), tiering applied. */
  directory = async (req: Request, res: Response): Promise<Response> => {
    const q = req.query as { destination?: string; track?: string };
    const rows = await this.service.listDirectory({ destination: q.destination, track: q.track });
    return ok(res, rows, { count: rows.length });
  };

  /** GET /suppliers/candidates — FR3.8 candidate query for M5/M12. */
  candidates = async (req: Request, res: Response): Promise<Response> => {
    const rows = await this.service.findCandidates(req.query as unknown as CandidateQuery);
    return ok(res, rows, { count: rows.length });
  };

  /** GET /suppliers/:id — one supplier (contract view). */
  getOne = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.getOne(req.params.id));

  /** GET /suppliers/:id/audit — the audit trail (ops/debug). */
  auditTrail = async (req: Request, res: Response): Promise<Response> =>
    ok(res, this.service.auditTrail(req.params.id));

  /** PATCH /suppliers/:id — manual edit. */
  update = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.update(req.params.id, req.body as UpdateSupplierInput));

  /** POST /suppliers/:id/tat — declare/renegotiate TAT. */
  declareTat = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.declareTat(req.params.id, (req.body as { declared_tat_hours: number }).declared_tat_hours));

  /** POST /suppliers/:id/contract — clickwrap e-acceptance. */
  acceptContract = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.acceptContract(req.params.id, req.body as ContractAcceptance));

  /** POST /suppliers/:id/activate — vetting gate + cap policy. */
  activate = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.activate(req.params.id));

  /** POST /suppliers/:id/bench — assign to the reserve bench. */
  bench = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.assignToBench(req.params.id));
}
