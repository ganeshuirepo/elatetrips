import type { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../errors/AppError';

/**
 * Catches unmatched routes and funnels them to the error handler. Registered
 * after every router but before errorHandler (see app.ts), so any path that fell
 * through the API surfaces as a clean 404 in the standard error envelope instead
 * of Express's default HTML response.
 */
export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
}
