import { z } from 'zod';

/** Comma-separated query param → string[] (e.g. ?amenities=pool,spa). */
const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined));

const csvNumbers = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? v
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => !Number.isNaN(n))
      : undefined,
  );

export const hotelListQuerySchema = z.object({
  stars: csvNumbers,
  types: csv,
  amenities: csv,
  activities: csv,
  roomSizes: csv,
  views: csv,
  climate: csv,
  maxPrice: z.coerce.number().positive().optional(),
});

export const activityQuerySchema = z.object({
  kind: z.enum(['adventure', 'experience']).optional(),
});

export const bundleQuerySchema = z.object({
  dest: z.string().trim().min(1).max(40).optional(),
});

export const productQuerySchema = z.object({
  shop: z.enum(['gifts', 'medical']).optional(),
  cat: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export const availabilityBodySchema = z.object({
  roomId: z.string().trim().min(1).max(40),
  checkin: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'checkin must be YYYY-MM-DD'),
  nights: z.coerce.number().int().min(1).max(30),
  rooms: z.coerce.number().int().min(1).max(5),
});

/** Comma-separated destination ids, e.g. ?dest=ooty,coorg. Optional. */
export const experienceFacetQuerySchema = z.object({
  dest: z.string().max(200).optional(),
});
