/**
 * Zod schemas guarding the M5 endpoints. The validate() middleware runs these at
 * the route edge and REPLACES req.params/body with the parsed result, so the
 * controller reads typed, clean data and never re-checks shapes. No business
 * value lives here — only structural bounds.
 */
import { z } from 'zod';

const track = z.enum(['A', 'B']);

/** :rfqId path param — non-empty. */
export const rfqIdParamSchema = z.object({ rfqId: z.string().min(1) });

/** POST /broadcast/rfq/:rfqId/wave body. */
export const dispatchWaveBodySchema = z.object({
  route: track,
  destination: z.string().trim().min(1).max(80),
  track,
  includeBench: z.boolean().optional(),
  channel: z.string().trim().min(1).max(40).optional(),
});

/** POST /broadcast/bench/evaluate body — the live load signals for a dest+track. */
export const benchEvaluateBodySchema = z.object({
  destination: z.string().trim().min(1).max(80),
  track,
  rfq_volume: z.number().nonnegative().optional(),
  median_response_hours: z.number().nonnegative().optional(),
  recent_coverage: z.array(z.number().nonnegative()).optional(),
  currently_activated: z.boolean(),
});

/** POST /broadcast/rfq/:rfqId/stop body. */
export const stopBodySchema = z.object({
  outcome: z.enum(['confirmed', 'cancelled']),
  winner_supplier_id: z.string().min(1).optional(),
  loss_reasons: z.record(z.string(), z.string()).optional(),
});
