import { z } from 'zod';

/**
 * Zod schemas + inferred types for the admin & console routes. Catalog payloads
 * come in create/update pairs: create takes the full shape, update is
 * `.omit({ id }).partial()` — same fields, all optional, id not patchable. The
 * file also holds the console-login and vendor-onboarding schemas and the route
 * param schemas. Note vendorCreateSchema.refine: refId is required for every
 * vendorType except 'ground' (ground crew have no catalog listing to bind to).
 */

const strArr = z.array(z.string()).default([]);

export const hotelCreateSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(2),
  area: z.string().default(''),
  type: z.string().default('hotel'),
  stars: z.number().int().min(1).max(5),
  price: z.number().positive(),
  rating: z.number().min(0).max(5).default(4.5),
  reviews: z.number().int().min(0).default(0),
  tag: z.string().optional(),
  amenities: strArr,
  activities: strArr,
  roomSizes: strArr,
  views: strArr,
  climate: strArr,
});
export const hotelUpdateSchema = hotelCreateSchema.omit({ id: true }).partial();

export const bundleCreateSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(2),
  dest: z.string().min(2),
  occasion: z.string().min(2),
  occLabel: z.string().min(2),
  nights: z.number().int().min(1).max(14),
  durationLabel: z.string().optional(),
  premium: z.boolean().default(false),
  groupSize: z.string().nullable().default(null),
  availability: z.enum(['daily', 'weekend']).default('daily'),
  fromPrice: z.number().positive(),
  unit: z.string().min(2),
  inclusions: z.array(z.string().min(2)).min(1),
  exclusions: strArr,
  experiences: strArr,
  legs: z
    .array(z.object({ dest: z.string().min(2), nights: z.number().int().min(1) }))
    .optional(),
});
export const bundleUpdateSchema = bundleCreateSchema.omit({ id: true }).partial();

export const vehicleCreateSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(2),
  sub: z.string().default(''),
  max: z.number().int().min(1).max(60),
  rate: z.number().positive(),
  localRate: z.number().positive(),
});
export const vehicleUpdateSchema = vehicleCreateSchema.omit({ id: true }).partial();

export const activityCreateSchema = z.object({
  kind: z.enum(['adventure', 'experience']),
  id: z.string().min(1).optional(),
  name: z.string().min(2),
  sub: z.string().default(''),
  icon: z.string().default('🎯'),
  price: z.number().positive(),
  category: z.string().optional(),
  inc: strArr,
});
export const activityUpdateSchema = activityCreateSchema.omit({ id: true, kind: true }).partial();

// ---- Console accounts (admin + vendor logins) -----------------------------
export const consoleLoginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

export const vendorCreateSchema = z
  .object({
    username: z
      .string()
      .min(3)
      .regex(/^[a-z0-9_.-]+$/i, 'letters, numbers, dots, dashes only'),
    password: z.string().min(6),
    displayName: z.string().min(2),
    vendorType: z.enum(['hotel', 'cab', 'experience', 'ground']),
    refId: z.string().min(1).optional(),
  })
  .refine((v) => v.vendorType === 'ground' || !!v.refId, {
    message: 'A listing reference is required for this vendor type',
    path: ['refId'],
  });

/** Vendor listing patch — per-type field validation happens in the service. */
export const listingUpdateSchema = z.record(z.string(), z.unknown());

export const idParamsSchema = z.object({ id: z.string().min(1) });
export const activityParamsSchema = z.object({
  kind: z.enum(['adventure', 'experience']),
  id: z.string().min(1),
});

export type HotelCreate = z.infer<typeof hotelCreateSchema>;
export type HotelUpdate = z.infer<typeof hotelUpdateSchema>;
export type BundleCreate = z.infer<typeof bundleCreateSchema>;
export type BundleUpdate = z.infer<typeof bundleUpdateSchema>;
export type VehicleCreate = z.infer<typeof vehicleCreateSchema>;
export type VehicleUpdate = z.infer<typeof vehicleUpdateSchema>;
export type ActivityCreate = z.infer<typeof activityCreateSchema>;
export type ActivityUpdate = z.infer<typeof activityUpdateSchema>;
export type VendorCreate = z.infer<typeof vendorCreateSchema>;
