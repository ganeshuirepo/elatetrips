import { z } from 'zod';
import { PARTNER_TYPES } from './partner.types';

const businessSchema = z.object({
  businessName: z.string().trim().min(1, 'Business name is required').max(160),
  city: z.string().max(120).default(''),
  contactName: z.string().max(120).default(''),
  role: z.string().max(120).default(''),
  email: z.string().trim().email('Enter a valid email').max(160),
  phone: z.string().trim().min(6, 'Enter a valid phone').max(20),
});

/**
 * Track-specific template answers. Kept deliberately loose (string or string[]
 * per field) so the frontend can evolve its form templates without a backend
 * release — but bounded, so the record can't be abused as a dumping ground.
 */
const detailsSchema = z
  .record(z.union([z.string().max(2000), z.array(z.string().max(300)).max(60)]))
  .default({})
  .refine((r) => Object.keys(r).length <= 100, 'Too many detail fields');

const portfolioItemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required').max(160),
  description: z.string().max(1000).default(''),
  priceRange: z.string().max(120).default(''),
  link: z.string().max(500).default(''),
});

export const createPartnerEoiSchema = z.object({
  partnerType: z.enum(PARTNER_TYPES),
  business: businessSchema,
  details: detailsSchema,
  portfolio: z.array(portfolioItemSchema).max(60).default([]),
  notes: z.string().max(2000).default(''),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Consent is required to submit' }),
  }),
});

/** Updates replace the editable content; ownership is checked in the service. */
export const updatePartnerEoiSchema = createPartnerEoiSchema;

export const eoiParamsSchema = z.object({
  referenceId: z.string().trim().min(1).max(40),
});

/** Registered email doubles as the ownership proof for read/update. */
export const eoiOwnerQuerySchema = z.object({
  email: z.string().trim().email('Enter a valid email').max(160),
});
