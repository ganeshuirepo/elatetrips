import type { Request, Response } from 'express';
import type { PricingService } from './pricing.service';
import { ok } from '../../common/http/ApiResponse';

export class PricingController {
  constructor(private readonly service: PricingService) {}

  localEstimate = async (req: Request, res: Response): Promise<Response> => {
    const { vehicleId, days } = req.body;
    return ok(res, await this.service.localEstimate(vehicleId, days));
  };

  pickupEstimate = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.pickupEstimate(req.body));
}
