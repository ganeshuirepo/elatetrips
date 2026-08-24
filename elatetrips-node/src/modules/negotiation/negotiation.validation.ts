/**
 * Zod schemas guarding the M13 endpoints. validate() runs these at the route edge
 * and REPLACES req parts with the parsed result, so the controller reads typed,
 * clean data and never re-checks shapes. Business ranges (thresholds, %s) are NOT
 * pinned here — those live in rule data (BR-17); these schemas only enforce shape.
 */
import { z } from 'zod';

const currency = z.enum(['INR', 'USD', 'EUR', 'GBP', 'AED']);
const money = z.object({ amount: z.number().int(), currency });

const benchmark = z.object({
  median: money,
  band_low: money,
  band_high: money,
  sample_size: z.number().int().nonnegative().optional(),
});

/** POST /negotiation/decide body — a DecisionInput. */
export const decideBodySchema = z.object({
  quote: z.object({
    quote_id: z.string().min(1),
    rfq_id: z.string().min(1).optional(),
    total: money,
    validity_ts: z.string().min(1).optional(),
    supplier_tier: z.enum(['primary', 'bench', 'reserve', 'preferred']).optional(),
  }),
  target_total: money.optional(),
  benchmark: benchmark.optional(),
  round_no: z.number().int().min(1),
  quote_count: z.number().int().nonnegative().optional(),
  signals: z
    .object({
      destination: z.string().optional(),
      track: z.enum(['A', 'B']).optional(),
      season: z.string().optional(),
      occasion_type: z.string().optional(),
      budget_band: z.string().optional(),
      at: z.string().optional(),
    })
    .optional(),
  actor: z.enum(['ai', 'ops']).optional(),
});

const condition = z.object({
  field: z.string().min(1),
  op: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'in', 'nin']),
  value: z.union([z.number(), z.string(), z.boolean(), z.array(z.union([z.number(), z.string()]))]),
});

const scope = z.object({
  destination: z.array(z.string()).optional(),
  track: z.enum(['A', 'B']).optional(),
  season: z.string().optional(),
  date_window: z.object({ from: z.string(), to: z.string() }).optional(),
  supplier_tier: z.enum(['primary', 'bench', 'reserve', 'preferred']).optional(),
  occasion_type: z.string().optional(),
  budget_band: z.string().optional(),
});

const params = z.object({
  target_basis: z.enum(['budget', 'benchmark_median', 'quote_minus_pct']).optional(),
  value: z.number().optional(),
  max_concession_pct: z.number().optional(),
  rounds_allowed: z.number().int().optional(),
});

export const ruleSchema = z.object({
  rule_id: z.string().min(1),
  name: z.string().min(1),
  priority: z.number().int(),
  scope: scope.default({}),
  conditions: z.array(condition).default([]),
  action: z.enum(['counter', 'accept', 'hold', 'escalate_to_ops', 'no_negotiate']),
  params: params.default({}),
  enabled: z.boolean().default(true),
  effective_from: z.string().optional(),
  effective_to: z.string().optional(),
});

/** POST /negotiation/rules — publish a new version. */
export const publishBodySchema = z.object({
  rules: z.array(ruleSchema),
  published_by: z.string().optional(),
  effective_from: z.string().optional(),
  effective_to: z.string().optional(),
  dry_run_id: z.string().optional(),
  note: z.string().optional(),
});

/** POST /negotiation/rules/dry-run — replay a candidate set. */
export const dryRunBodySchema = z.object({
  rules: z.array(ruleSchema),
});

/** POST /negotiation/rules/rollback — restore a prior version. */
export const rollbackBodySchema = z.object({
  to_version: z.number().int().min(1),
  actor: z.string().optional(),
});

export const versionParamSchema = z.object({ version: z.coerce.number().int().min(1) });

export const activeQuerySchema = z.object({ at: z.string().optional() });

export const eventsQuerySchema = z.object({
  quote_id: z.string().optional(),
  type: z.enum(['negotiation.round', 'rule.evaluated', 'rule.published', 'rule.rolled_back']).optional(),
});
