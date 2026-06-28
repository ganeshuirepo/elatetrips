import { z } from 'zod';

const billingSchema = z
  .object({
    name: z.string().max(120).optional(),
    email: z.string().email().or(z.literal('')).optional(),
    address: z.string().max(240).optional(),
    city: z.string().max(80).optional(),
    pin: z.string().regex(/^\d{0,6}$/).optional(),
    gst: z.string().max(20).optional(),
  })
  .partial();

export const updateProfileSchema = z
  .object({
    name: z.string().max(120).optional(),
    email: z.string().email().or(z.literal('')).optional(),
    billing: billingSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No profile fields provided' });
