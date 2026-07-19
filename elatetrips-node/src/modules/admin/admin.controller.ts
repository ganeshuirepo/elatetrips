import type { Request, Response } from 'express';
import { created, ok } from '../../common/http/ApiResponse';
import type { AdminService } from './admin.service';

/** Thin transport layer for the admin console — all logic in AdminService. */
export class AdminController {
  constructor(private readonly service: AdminService) {}

  overview = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.overview());
  };

  listOrders = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.listOrders());
  };

  createHotel = async (req: Request, res: Response): Promise<void> => {
    created(res, await this.service.createHotel(req.body));
  };

  updateHotel = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.updateHotel(req.params.id, req.body));
  };

  createBundle = async (req: Request, res: Response): Promise<void> => {
    created(res, await this.service.createBundle(req.body));
  };

  updateBundle = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.updateBundle(req.params.id, req.body));
  };

  createVehicle = async (req: Request, res: Response): Promise<void> => {
    created(res, await this.service.createVehicle(req.body));
  };

  updateVehicle = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.updateVehicle(req.params.id, req.body));
  };

  createActivity = async (req: Request, res: Response): Promise<void> => {
    created(res, await this.service.createActivity(req.body));
  };

  updateActivity = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.updateActivity(req.params.kind, req.params.id, req.body));
  };
}
