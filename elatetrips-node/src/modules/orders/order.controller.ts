import type { Request, Response } from 'express';
import type { OrderService } from './order.service';
import { ok, created } from '../../common/http/ApiResponse';
import { UnauthorizedError } from '../../common/errors/AppError';

export class OrderController {
  constructor(private readonly service: OrderService) {}

  private phoneOf(req: Request): string {
    if (!req.user?.phone) throw new UnauthorizedError();
    return req.user.phone;
  }

  create = async (req: Request, res: Response): Promise<Response> =>
    created(res, await this.service.createOrder(this.phoneOf(req), req.body));

  listMine = async (req: Request, res: Response): Promise<Response> => {
    const orders = await this.service.listMyOrders(this.phoneOf(req));
    return ok(res, orders, { count: orders.length });
  };

  getOne = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.getMyOrder(this.phoneOf(req), req.params.tripId));
}
