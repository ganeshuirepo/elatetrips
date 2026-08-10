import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { UnauthorizedError } from '../errors/AppError';
import type { ITokenService } from '../../modules/auth/auth.types';
import { verifyConsoleToken } from '../../modules/admin/console.token';

/**
 * Accepts EITHER a user JWT or a console token — for surfaces both sides use
 * (photo uploads, push-token registration). Populates `req.user` for a user
 * token or `res.locals.console` for a console one, so downstream code can
 * tell who arrived. Role-restricted routes keep using their own guards.
 */
export function buildIdentityGuard(tokenService: ITokenService): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next(new UnauthorizedError('Missing bearer token'));
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    try {
      req.user = tokenService.verify(token);
      next();
      return;
    } catch {
      // Not a user token — try the console scope before refusing.
    }
    try {
      res.locals.console = verifyConsoleToken(token);
      next();
    } catch {
      next(new UnauthorizedError('Invalid or expired token'));
    }
  };
}
