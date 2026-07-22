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
 * Client errors raised by middleware we don't own — body-parser's 413 payload
 * too large, 400 malformed JSON — arrive as `http-errors` instances. They set
 * `expose: true` for 4xx precisely to mark the message as safe to return, so
 * these keep their status instead of collapsing into a generic 500.
 */
function exposedClientError(err: unknown): { status: number; message: string } | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as { status?: unknown; statusCode?: unknown; expose?: unknown; message?: unknown };
  const raw = typeof e.status === 'number' ? e.status : e.statusCode;
  if (typeof raw !== 'number' || raw < 400 || raw > 499) return null;
  if (e.expose !== true) return null;
  return { status: raw, message: typeof e.message === 'string' ? e.message : 'Bad request' };
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
    // Operational: the message was written for the caller, so it ships as-is.
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else {
    const client = exposedClientError(err);
    if (client) {
      statusCode = client.status;
      message = client.message;
    }
  }
  // Anything else is a bug, not an operational error. Its message is written for
  // us — Mongoose validator text, driver failures, stack-carrying strings — so it
  // stays in the log and the caller gets the generic 500 above.

  if (statusCode >= 500) {
    logger.error(err instanceof Error ? err.message : 'Non-Error thrown', err);
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
