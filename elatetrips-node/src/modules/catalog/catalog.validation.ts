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

export const productQuerySchema = z.object({
  shop: z.enum(['gifts', 'medical']).optional(),
  cat: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });
