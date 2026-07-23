import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { UnauthorizedError } from '../errors/AppError';
import type { ITokenService } from '../../modules/auth/auth.types';

/**
 * Builds an authentication guard from a token service (Dependency Inversion:
 * the guard knows the ITokenService contract, not JWT). Populates `req.user`.
 */
export function buildAuthGuard(tokenService: ITokenService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return next(new UnauthorizedError('Missing bearer token'));
    }
    const token = header.slice('Bearer '.length).trim();
    try {
      // On success the verified principal is attached to req.user for downstream
      // controllers; verification failures (expired/invalid token) are handed to
      // the central error handler rather than turned into a response here.
      req.user = tokenService.verify(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}
