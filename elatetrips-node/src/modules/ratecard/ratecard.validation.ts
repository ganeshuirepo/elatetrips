/**
 * Zod schemas guarding the M17 endpoints. The validate() middleware runs these
 * at the route edge and REPLACES req.params/query/body with the parsed result,
 * so the controller reads typed, clean data. Structural validation stops here;
 * business rules (tolerance, drift, freshness) live in the pure pipeline.
 *
 * Note: these guard the SHAPE of an upload. Per-row cell-level validation
 * (invalid rows never land, cell refs returned) is validateRow() in the pipeline
 * — a malformed batch envelope is a 400, a bad row is a reported rejection.
 */
import { z } from 'zod';

const cellSchema = z.object({
  sheet: z.string().trim().min(1).max(120),
  row: z.coerce.number().int().min(1),
});

/**
 * One raw upload row. Fields are permissive on purpose — validateRow() in the
 * pipeline is the authority on what is a valid rate row; here we only ensure the
 * types are what the pipeline expects to inspect, and that a cell ref is present.
 */
const rawRowSchema = z.object({
  partner_id: z.string().optional(),
  destination: z.string().optional(),
  sku: z.string().optional(),
  price_minor: z.number().optional(),
  currency: z.string().optional(),
  effective_from: z.string().optional(),
  effective_to: z.string().optional(),
  schema_version: z.number().optional(),
  cell: cellSchema,
});

export const ingestBodySchema = z.object({
  rows: z.array(rawRowSchema).min(1).max(5000),
});

export const partnerParamSchema = z.object({
  partnerId: z.string().trim().min(1).max(128),
});

export const proposalParamSchema = z.object({
  proposalId: z.string().trim().min(1).max(128),
});

export const stagedQuerySchema = z.object({
  partner_id: z.string().trim().min(1).max(128).optional(),
  sku: z.string().trim().min(1).max(128).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

export const skuQuerySchema = z.object({
  sku: z.string().trim().min(1).max(128),
  at: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'at must be an ISO date (YYYY-MM-DD)').optional(),
});

export const skuRequiredQuerySchema = z.object({
  sku: z.string().trim().min(1).max(128),
});

export const approveBodySchema = z.object({
  actor_id: z.string().trim().min(1).max(128),
});

export const rejectBodySchema = z.object({
  actor_id: z.string().trim().min(1).max(128),
  note: z.string().trim().max(2000).optional(),
});
