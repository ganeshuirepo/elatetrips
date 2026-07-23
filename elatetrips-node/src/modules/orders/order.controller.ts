/**
 * Orders HTTP controller — the thin edge between Express and OrderService.
 *
 * Each handler does three things and nothing more: pull the owner identity from
 * the request, call one service method with the already-validated req.body/params,
 * and wrap the result in the standard success envelope (created() = 201, ok() =
 * 200; see common/http/ApiResponse). All business rules live in OrderService.
 * Handlers run inside asyncHandler (see order.routes), so thrown errors surface
 * to the central error middleware rather than being caught here.
 */
import type { Request, Response } from 'express';
import type { OrderService } from './order.service';
import { ok, created } from '../../common/http/ApiResponse';
import { UnauthorizedError } from '../../common/errors/AppError';

export class OrderController {
  constructor(private readonly service: OrderService) {}

  // The mobile number IS the account key for orders. authGuard has already put
  // req.user on the request from the JWT; a token with no phone means we can't
  // attribute the trip to anyone, so reject rather than guess an owner.
  private phoneOf(req: Request): string {
    if (!req.user?.phone) throw new UnauthorizedError();
    return req.user.phone;
  }

  // req.body is the createOrderSchema-validated CreateOrderInput. Reply 201 with
  // the persisted order (which now carries its generated tripId).
  create = async (req: Request, res: Response): Promise<Response> =>
    created(res, await this.service.createOrder(this.phoneOf(req), req.body));

  // List this account's trips; expose the length as meta.count for the caller.
  listMine = async (req: Request, res: Response): Promise<Response> => {
    const orders = await this.service.listMyOrders(this.phoneOf(req));
    return ok(res, orders, { count: orders.length });
  };

  // Fetch one trip by id; the service raises 404 (unknown) or 403 (not yours).
  getOne = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.getMyOrder(this.phoneOf(req), req.params.tripId));
}
