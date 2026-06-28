import type { Request, Response } from 'express';
import type { PartnerService } from './partner.service';
import { created } from '../../common/http/ApiResponse';

/**
 * Thin HTTP adapter for the public hotelier EOI endpoint. The body is already
 * validated by middleware, so the controller just records it and echoes the
 * stored submission (including its reference id).
 */
export class PartnerController {
  constructor(private readonly service: PartnerService) {}

  create = async (req: Request, res: Response): Promise<Response> =>
    created(res, await this.service.createEoi(req.body));
}
