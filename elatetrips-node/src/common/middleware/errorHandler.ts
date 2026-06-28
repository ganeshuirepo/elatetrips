import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { env } from '../../config/env';
import { logger } from '../logger';

/** Shape of every error response body. */
interface ErrorBody {
  success: false;
  error: { message: string; details?: unknown };
}

/**
 * Central error handler — the single place that turns thrown errors into HTTP
 * responses. Keeping it here (Single Responsibility) means no controller needs
 * to know how errors are serialised.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  let statusCode = 500;
  let message = 'Internal server error';
  let details: unknown;

  if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation failed';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof Error) {
    message = err.message;
  }

  if (statusCode >= 500) {
    logger.error(message, err);
  }

  const body: ErrorBody = {
    success: false,
    error: { message, ...(details ? { details } : {}) },
  };
  if (!env.isProd && err instanceof Error && statusCode >= 500) {
    body.error.details = err.stack;
  }

  res.status(statusCode).json(body);
}
