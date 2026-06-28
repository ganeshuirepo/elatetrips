import type { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../errors/AppError';

/** Catches unmatched routes and funnels them to the error handler. */
export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
}
