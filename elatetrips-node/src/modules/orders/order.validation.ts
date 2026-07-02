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
  items: z
    .array(
      z.object({
        label: z.string(),
        detail: z.string().default(''),
        qty: z.number().int().positive().default(1),
        amount: z.number().nonnegative().default(0),
      }),
    )
    .default([]),
});

export const createOrderSchema = z.object({
  total: z.number().nonnegative(),
  contactName: z.string().max(120).default(''),
  contactPhone: z.string().max(15).default(''),
  contactEmail: z.string().max(160).default(''),
  coupon: z.string().max(24).optional(),
  discount: z.number().nonnegative().optional(),
  payment: z
    .object({
      method: z.string().max(24),
      txnId: z.string().max(64),
      status: z.literal('paid'),
    })
    .optional(),
  summary: summarySchema,
});

export const tripIdParamSchema = z.object({
  tripId: z.string().regex(/^ELT-\d+$/, 'Invalid trip id'),
});
