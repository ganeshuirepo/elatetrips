/**
 * Zod schemas guarding the classifier endpoints. These validate the SUBSET of
 * the frozen RFQ / itinerary contracts that the rules consume — a structural
 * check "by contract shape" (read-scope rule: no cross-module source import of
 * the ajv contract validators). `.passthrough()` tolerates the remaining
 * contract fields so a full RFQ/itinerary object is accepted unchanged.
 */
import { z } from 'zod';
import type { FulfilmentRoute } from './classifier.types';

const moneySchema = z
  .object({ amount: z.number(), currency: z.string() })
  .passthrough();

const rfqSchema = z
  .object({
    rfq_id: z.string().min(1),
    version: z.number().int().optional(),
    package_id: z.string().min(1).optional(),
    occasion: z
      .object({
        type: z.enum(['celebration', 'surprise', 'event', 'adventure', 'leisure']),
        details: z
          .object({
            celebrations: z
              .array(z.object({ kind: z.string() }).passthrough())
              .optional(),
            privacy: z.boolean().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
    destination: z
      .object({
        mode: z.enum(['place', 'suggest_for_me']),
        place: z.string().optional(),
        region_pref: z.string().optional(),
      })
      .passthrough(),
    dates: z
      .object({
        start: z.string().optional(),
        end: z.string().optional(),
        flex_days: z.number().int().optional(),
      })
      .passthrough()
      .optional(),
    travellers: z
      .object({
        adults: z.number().int().min(1),
        kids: z.array(z.object({ age: z.number().int() }).passthrough()),
      })
      .passthrough(),
    hotel: z
      .object({ budget_per_night: moneySchema, category: z.number().optional() })
      .passthrough(),
    inclusions: z.array(z.string()),
  })
  .passthrough();

const itineraryItemSchema = z
  .object({
    item_id: z.string().min(1),
    type: z.enum(['hotel', 'activity', 'transfer', 'meal', 'experience']),
    title: z.string().min(1),
    locked: z.boolean(),
    source: z.enum(['ai', 'master_db', 'customer']),
    route_pack_id: z.string().optional(),
  })
  .passthrough();

const itinerarySchema = z
  .object({
    itinerary_id: z.string().min(1),
    version: z.number().int().optional(),
    rfq_id: z.string().optional(),
    package_id: z.string().min(1).optional(),
    days: z.array(
      z
        .object({
          day_index: z.number().int(),
          items: z.array(itineraryItemSchema),
        })
        .passthrough(),
    ),
  })
  .passthrough();

/** POST /classifier/classify and /classifier/upgrade share the rfq+itinerary body. */
export const classifyBodySchema = z.object({
  rfq: rfqSchema,
  itinerary: itinerarySchema,
});

export const upgradeBodySchema = z.object({
  rfq: rfqSchema,
  itinerary: itinerarySchema,
  phase: z.enum(['pre_booking', 'post_booking']),
});

const routeValues: readonly [FulfilmentRoute, ...FulfilmentRoute[]] = [
  'package_pinned',
  'celebration_manager',
  'hotel',
  'dmc',
  'dual',
];

export const overrideBodySchema = z.object({
  rfq_id: z.string().min(1),
  route: z.enum(routeValues),
  actor: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const rfqIdParamSchema = z.object({ rfqId: z.string().min(1) });
