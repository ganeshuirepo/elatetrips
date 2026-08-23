/**
 * Contract validation — ajv 2020-12 over the bundled contract schemas (copied
 * from the shared `/contracts` surface). A body that fails is rejected at the
 * edge as a 422 carrying the ajv error paths, never a 500 (spec 006 FR-006-2).
 *
 * ajv-formats is optional here: with `strict:false`, unknown formats (date,
 * date-time) degrade to no-ops rather than erroring, so structural validation
 * holds without adding a dependency to the backend.
 */
import type { Request, Response, NextFunction } from 'express';
import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import { UnprocessableEntityError } from '../../common/errors/AppError';

import common from './schemas/defs/common.schema.json';
import rfq from './schemas/rfq.schema.json';
import itinerary from './schemas/itinerary.schema.json';
import supplier from './schemas/supplier.schema.json';
import quote from './schemas/quote.schema.json';
import policy from './schemas/policy.schema.json';
import routePack from './schemas/route-pack.schema.json';
import poi from './schemas/poi.schema.json';
import pkg from './schemas/package.schema.json';
import packageDelta from './schemas/package-delta.schema.json';

export type SchemaName =
  | 'rfq'
  | 'itinerary'
  | 'supplier'
  | 'quote'
  | 'policy'
  | 'route-pack'
  | 'poi'
  | 'package'
  | 'package-delta';

const SCHEMA_IDS: Record<SchemaName, string> = {
  rfq: 'https://elatetrips.com/contracts/rfq.schema.json',
  itinerary: 'https://elatetrips.com/contracts/itinerary.schema.json',
  supplier: 'https://elatetrips.com/contracts/supplier.schema.json',
  quote: 'https://elatetrips.com/contracts/quote.schema.json',
  policy: 'https://elatetrips.com/contracts/policy.schema.json',
  'route-pack': 'https://elatetrips.com/contracts/route-pack.schema.json',
  poi: 'https://elatetrips.com/contracts/poi.schema.json',
  package: 'https://elatetrips.com/contracts/package.schema.json',
  'package-delta': 'https://elatetrips.com/contracts/package-delta.schema.json',
};

const ajv = new Ajv2020({ allErrors: true, strict: false });
// Register the two date formats the schemas use so ajv validates (rather than
// silently ignoring) them, without pulling in the ajv-formats dependency.
ajv.addFormat('date', /^\d{4}-\d{2}-\d{2}$/);
ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
for (const schema of [common, rfq, itinerary, supplier, quote, policy, routePack, poi, pkg, packageDelta]) {
  ajv.addSchema(schema);
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult = { valid: true } | { valid: false; errors: ValidationIssue[] };

function getValidator(name: SchemaName): ValidateFunction {
  const validator = ajv.getSchema(SCHEMA_IDS[name]);
  if (!validator) throw new Error(`Contract schema not registered: ${name}`);
  return validator;
}

/** Validates data against a named schema, returning ajv error paths on failure. */
export function validateContract(name: SchemaName, data: unknown): ValidationResult {
  const validator = getValidator(name);
  if (validator(data)) return { valid: true };
  const errors: ValidationIssue[] = (validator.errors ?? []).map((e) => ({
    path: e.instancePath || '/',
    message: e.message ?? 'invalid',
  }));
  return { valid: false, errors };
}

/** Throws 422 with ajv paths when invalid; returns the value when valid. */
export function assertContract<T>(name: SchemaName, data: T): T {
  const result = validateContract(name, data);
  if (!result.valid) throw new UnprocessableEntityError('Contract validation failed', result.errors);
  return data;
}

/**
 * Express middleware: validate `req.body` against a contract schema before the
 * controller runs. Used on the routes whose body IS a full contract object.
 */
export function validateBody(name: SchemaName) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = validateContract(name, req.body);
    if (result.valid) return next();
    next(new UnprocessableEntityError('Contract validation failed', result.errors));
  };
}
