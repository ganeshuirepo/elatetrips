import { z } from 'zod';

/** The four trip classifications; mirrors the exported catalog's enum. */
export const classificationSchema = z.enum(['celebration', 'festival', 'recreation', 'pilgrimage']);

export const classificationQuerySchema = z.object({
  classification: classificationSchema.optional(),
});

/**
 * Festival window. Dates are plain ISO days (the export writes `2026-11-05`),
 * compared as strings — which is only sound because the format is fixed-width,
 * so the regex is load-bearing rather than decorative.
 */
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use an ISO date, e.g. 2026-11-05');

export const festivalQuerySchema = z.object({
  from: isoDay.optional(),
  to: isoDay.optional(),
});

export const planQuerySchema = z.object({
  occasion: z.string().min(1, 'Name the occasion, e.g. ?occasion=Char Dham'),
});
