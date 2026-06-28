import type { Request, Response } from 'express';
import type { UserService } from './user.service';
import { ok } from '../../common/http/ApiResponse';
import { UnauthorizedError } from '../../common/errors/AppError';

export class UserController {
  constructor(private readonly service: UserService) {}

  private phoneOf(req: Request): string {
    if (!req.user?.phone) throw new UnauthorizedError();
    return req.user.phone;
  }

  me = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.getProfile(this.phoneOf(req)));

  updateMe = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.updateProfile(this.phoneOf(req), req.body));
}
