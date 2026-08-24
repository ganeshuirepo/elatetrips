/**
 * M5 controller — thin HTTP adapter over BroadcastService. Reads the validated,
 * typed request, calls the service (which orchestrates the pure engine, the
 * M3/M4 ports, and audit emission), and returns the uniform `{ success, data }`
 * envelope. No business logic here (Single Responsibility).
 */
import type { Request, Response } from 'express';
import { ok } from '../../common/http/ApiResponse';
import type { BroadcastService } from './broadcast.service';

export class BroadcastController {
  constructor(private readonly service: BroadcastService) {}

  dispatchWave = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.dispatchWave({ rfq_id: req.params.rfqId, ...req.body }));

  getWaves = async (req: Request, res: Response): Promise<Response> =>
    ok(res, this.service.getState(req.params.rfqId));

  evaluateBench = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.evaluateBench(req.body));

  stop = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.stop({ rfq_id: req.params.rfqId, ...req.body }));
}
