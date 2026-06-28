import { z } from 'zod';

const summarySchema = z.object({
  destination: z.string(),
  dates: z.string(),
  travellers: z.string(),
  transportLabel: z.string(),
  hotelLabel: z.string(),
  packages: z
    .array(z.object({ celeb: z.string(), names: z.array(z.string()) }))
    .default([]),
  adventures: z.array(z.string()).default([]),
  experiences: z.array(z.string()).default([]),
});

export const createOrderSchema = z.object({
  total: z.number().nonnegative(),
  contactName: z.string().max(120).default(''),
  contactPhone: z.string().max(15).default(''),
  contactEmail: z.string().max(160).default(''),
  summary: summarySchema,
});

export const tripIdParamSchema = z.object({
  tripId: z.string().regex(/^ELT-\d+$/, 'Invalid trip id'),
});
