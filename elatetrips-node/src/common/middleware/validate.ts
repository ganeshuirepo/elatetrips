import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Request-validation middleware factory. Parses and REPLACES req parts with the
 * typed, coerced result, so controllers receive clean data and never re-check
 * shapes. Validation lives at the edge; business logic stays pure.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // parse() both validates and coerces (e.g. numeric strings → numbers), and
      // the result replaces the raw input so controllers read typed values.
      if (schemas.params) req.params = schemas.params.parse(req.params);
      // req.query is exposed through a getter with no setter, so it can't be
      // reassigned like params/body — merge the parsed values onto it in place.
      if (schemas.query) Object.assign(req.query, schemas.query.parse(req.query));
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (err) {
      // A ZodError here reaches errorHandler, which maps it to a 400 with the
      // per-field issues — validation failures never leak past the edge.
      next(err);
    }
  };
}
