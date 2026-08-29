import type { Request, Response } from 'express';
import type { AuthService } from './auth.service';
import { ok, created } from '../../common/http/ApiResponse';
import { UnauthorizedError } from '../../common/errors/AppError';

/**
 * The signed-in caller's phone, taken from the verified JWT claims that
 * authGuard put on the request — never from the body or query. This is what
 * keeps the channel-verification routes from being pointed at another
 * account. A token without a phone claim cannot identify anybody, so it fails
 * closed rather than falling back to client input.
 */
function callerPhone(req: Request): string {
  if (!req.user?.phone) throw new UnauthorizedError();
  return req.user.phone;
}

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

  refresh = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.refreshSession(req.body.refreshToken));

  resetPassword = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.resetPassword(req.body.identifier, req.body.otp, req.body.password));

  requestChannelVerification = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.requestChannelVerification(callerPhone(req), req.body.channel));

  confirmChannelVerification = async (req: Request, res: Response): Promise<Response> =>
    ok(
      res,
      await this.service.confirmChannelVerification(
        callerPhone(req),
        req.body.channel,
        req.body.otp,
      ),
    );
}
