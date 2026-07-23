/**
 * Guards for the console surfaces. consoleGuard protects the /vendor routes
 * (used in console.routes); buildAdminGuard protects the /admin routes (wired in
 * container.ts and applied in admin.routes). Both verify a scope:'console' JWT
 * and, on success, expose its claims on res.locals.console for the controllers.
 * A missing/invalid token -> 401; a valid token with the wrong role -> 403.
 */
import type { RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../../common/errors/AppError';
import { verifyConsoleToken } from './console.token';
import type { ConsoleRole } from './console.model';

/**
 * Console guard: requires a Bearer console token with one of the given
 * roles. Claims land in res.locals.console for the controllers.
 */
export function consoleGuard(...roles: ConsoleRole[]): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next(new UnauthorizedError('Missing bearer token'));
      return;
    }
    try {
      const claims = verifyConsoleToken(header.slice('Bearer '.length).trim());
      if (!roles.includes(claims.role)) {
        next(new ForbiddenError('Insufficient role'));
        return;
      }
      res.locals.console = claims;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Admin-surface guard: an admin console token, or the shared x-admin-key
 * (kept for ops scripts and the mock-first phase).
 */
export function buildAdminGuard(adminKey: string): RequestHandler {
  return (req, res, next) => {
    if (req.header('x-admin-key') === adminKey) {
      next();
      return;
    }
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const claims = verifyConsoleToken(header.slice('Bearer '.length).trim());
        if (claims.role === 'admin') {
          res.locals.console = claims;
          next();
          return;
        }
      } catch {
        /* fall through to the 401 below */
      }
    }
    next(new UnauthorizedError('Admin credentials required'));
  };
}
