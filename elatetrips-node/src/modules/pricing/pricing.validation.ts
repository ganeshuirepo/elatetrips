import { z } from 'zod';

export const localEstimateSchema = z.object({
  vehicleId: z.string().min(1),
  days: z.coerce.number().int().positive().default(1),
});

export const pickupEstimateSchema = z.object({
  pickupLat: z.coerce.number().min(-90).max(90),
  pickupLon: z.coerce.number().min(-180).max(180),
  destId: z.string().min(1),
  vehicleId: z.string().min(1).optional(),
});
