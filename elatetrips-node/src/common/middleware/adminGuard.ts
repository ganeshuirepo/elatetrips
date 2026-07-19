import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../errors/AppError';

/**
 * Admin-console guard: a shared key in the `x-admin-key` header. Deliberately
 * simple for the mock-first phase — swaps for real admin accounts later
 * without touching the routes that use it.
 */
export function buildAdminGuard(adminKey: string): RequestHandler {
  return (req, _res, next) => {
    if (req.header('x-admin-key') !== adminKey) {
      next(new UnauthorizedError('Admin key required'));
      return;
    }
    next();
  };
}
