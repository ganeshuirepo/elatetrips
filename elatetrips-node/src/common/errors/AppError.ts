/**
 * Operational error with an HTTP status. Throwing `AppError` (or a subclass)
 * from anywhere lets the central error handler translate it into a clean JSON
 * response, so controllers/services never format error responses themselves.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    // Restore the prototype chain: subclassing a built-in (Error) via transpiled
    // output otherwise leaves instances as plain Error at runtime, which would
    // break the `instanceof AppError` checks the error handler relies on.
    Object.setPrototypeOf(this, new.target.prototype);
    // Drop this constructor frame from the captured stack for cleaner traces.
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(400, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, message);
  }
}

/**
 * Body failed contract (ajv) validation. 422 rather than 400 so a schema-invalid
 * payload is distinguishable from a malformed request, carrying the ajv error
 * paths in `details` (contracts-v1.1 adoption, spec 006 — never a 500).
 */
export class UnprocessableEntityError extends AppError {
  constructor(message = 'Contract validation failed', details?: unknown) {
    super(422, message, details);
  }
}
