/**
 * Guards for the console surfaces. consoleGuard protects the /vendor routes
 * (used in console.routes); buildAdminGuard protects the /admin routes (wired in
 * container.ts and applied in admin.routes). Both verify a scope:'console' JWT
 * and, on success, expose its claims on res.locals.console for the controllers.
 * A missing/invalid token -> 401; a valid token with the wrong role -> 403.
 */
import { createHash, timingSafeEqual } from 'crypto';
import type { RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../../common/errors/AppError';
import { verifyConsoleToken, type ConsoleClaims } from './console.token';
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
 * Partner-scoped guard for `/…/partners/:partnerId/…`.
 *
 * The partner id sits in the URL, where it is an ADDRESS, not a secret — it is
 * short, sequential-ish and shared in emails, so it can never be the thing that
 * authorises the request. This is what authorises it: either an ops-side role
 * (admin, cm, om) which may act for any partner, or a partner account whose own
 * `partnerId` claim equals the one in the path.
 *
 * Deliberately fails closed when an account has no partnerId bound: an
 * unbound vendor account must not inherit access to every partner's rates
 * merely because the comparison would otherwise be undefined-vs-undefined.
 */
export function partnerScopedGuard(...opsRoles: ConsoleRole[]): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next(new UnauthorizedError('Missing bearer token'));
      return;
    }
    let claims: ConsoleClaims;
    try {
      claims = verifyConsoleToken(header.slice('Bearer '.length).trim());
    } catch (err) {
      next(err);
      return;
    }

    res.locals.console = claims;
    if (opsRoles.includes(claims.role)) {
      next();
      return;
    }

    const target = req.params.partnerId;
    if (claims.partnerId && target && claims.partnerId === target) {
      next();
      return;
    }
    // Same answer whether the partner exists or simply is not yours, so the
    // endpoint cannot be used to discover which partner ids are real.
    next(new ForbiddenError('This rate card belongs to another partner'));
  };
}

/**
 * Compare two secrets without leaking how much of the prefix matched.
 *
 * `===` on strings returns the moment two bytes differ, so the time it takes is
 * a function of how many leading characters were right. Hashing first gives
 * timingSafeEqual the equal-length buffers it requires (it throws otherwise),
 * and keeps the comparison independent of the submitted value's length.
 */
function secretsMatch(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Admin-surface guard: an admin console token, or the shared x-admin-key
 * (kept for ops scripts and the mock-first phase). The key itself is validated
 * at boot by config/env resolveAdminKey, which refuses to start production on a
 * default or missing value.
 */
export function buildAdminGuard(adminKey: string): RequestHandler {
  return (req, res, next) => {
    if (secretsMatch(req.header('x-admin-key'), adminKey)) {
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
