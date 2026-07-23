import type { Request, Response } from 'express';
import type { AuthService } from './auth.service';
import { ok, created } from '../../common/http/ApiResponse';

/**
 * Auth controller — thin HTTP transport over AuthService. Each handler reads the
 * already-validated fields off req.body (the validate middleware ran first),
 * delegates to the service, and wraps the result in the standard ApiResponse
 * envelope: ok -> 200, created -> 201. No business logic lives here.
 */
export class AuthController {
  constructor(private readonly service: AuthService) {}

  requestOtp = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.requestOtp(req.body.identifier));

  verifyOtp = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.verifyOtp(req.body.identifier, req.body.otp));

  resendOtp = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.resendOtp(req.body.identifier));

  signup = async (req: Request, res: Response): Promise<Response> => {
    // verifyVia is a routing choice (which channel to OTP), not profile data —
    // split it out so the service receives just the SignupData fields.
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
