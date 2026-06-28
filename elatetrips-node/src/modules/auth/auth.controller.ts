import type { Request, Response } from 'express';
import type { AuthService } from './auth.service';
import { ok, created } from '../../common/http/ApiResponse';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  requestOtp = async (req: Request, res: Response): Promise<Response> =>
    ok(res, this.service.requestOtp(req.body.phone));

  verifyOtp = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.verifyOtp(req.body.phone, req.body.otp));

  signup = async (req: Request, res: Response): Promise<Response> => {
    const { verifyVia, ...data } = req.body;
    return created(res, await this.service.signup(data, verifyVia));
  };

  verifyAccount = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.verifyAccount(req.body.identifier, req.body.otp));

  login = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.login(req.body.identifier, req.body.password));

  forgotPassword = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.forgotPassword(req.body.identifier));

  resetPassword = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.resetPassword(req.body.identifier, req.body.otp, req.body.password));
}
