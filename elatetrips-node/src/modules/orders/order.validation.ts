/**
 * Zod request schemas for the orders API — the validation contract at the HTTP
 * edge. The validate() middleware (common/middleware/validate) parses req.body /
 * req.params against these and REPLACES them with the typed, defaulted result, so
 * the controller and service receive clean data and never re-check shapes.
 *
 * Defaults here (empty strings, empty arrays, qty=1) let downstream code treat
 * optional fields as present. These schemas bound only the INPUT: the coupon
 * discount is still recomputed and re-verified in OrderService (see coupons.ts),
 * so passing validation here does NOT by itself authorise any discount.
 */
import { z } from 'zod';

const summarySchema = z.object({
  destination: z.string(),
  dates: z.string(),
  travellers: z.string(),
  transportLabel: z.string(),
  hotelLabel: z.string(),
  // Capped server-side too: the client limit is a UI affordance, not a control.
  preferredHotels: z.array(z.string()).max(3).default([]),
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
  /**
   * Celebration brief — the details that make a set-up land, and the secrecy
   * flag. `keepSecret` means the surprise must not reach the person being
   * celebrated: no confirmation to their address, discreet handling on site.
   */
  celebration: z
    .object({
      occasionDate: z.string().max(10).default(''),
      cakeMessage: z.string().max(120).default(''),
      dietary: z.string().max(240).default(''),
      notes: z.string().max(500).default(''),
      keepSecret: z.boolean().default(false),
    })
    .optional(),
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

// Guards the :tripId route param: must be ELT-<digits> (the format minted in
// order.repository), rejecting malformed ids before any DB lookup.
export const tripIdParamSchema = z.object({
  tripId: z.string().regex(/^ELT-\d+$/, 'Invalid trip id'),
});
