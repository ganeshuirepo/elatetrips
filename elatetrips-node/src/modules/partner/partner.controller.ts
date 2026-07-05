import type { Request, Response } from 'express';
import type { PartnerService } from './partner.service';
import { created, ok } from '../../common/http/ApiResponse';

/**
 * Thin HTTP adapter for the public vendor EOI endpoints. Bodies, params and
 * queries are already validated by middleware, so the controller just wires
 * them to the service.
 */
export class PartnerController {
  constructor(private readonly service: PartnerService) {}

  create = async (req: Request, res: Response): Promise<Response> =>
    created(res, await this.service.createEoi(req.body));

  get = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.getEoi(req.params.referenceId, String(req.query.email)));

  update = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.updateEoi(req.params.referenceId, String(req.query.email), req.body));
}
