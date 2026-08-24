/**
 * Illustrative, EDITABLE seed data for M13 (FR13.6) and a small historical quote
 * corpus for dry-run demos/tests (FR13.5). This is *business* data, not engine
 * logic: the live store ships EMPTY (BR-17) and only loads these when an operator
 * opts in (config `NEGOTIATION_SEED_RULES`, or an explicit seed call). Nothing
 * here is imported by the engine — it exists purely as sample data.
 *
 * The rule set is deliberately arranged so a dry-run over the corpus flags
 * exactly one DEAD rule (matches nothing) and one SHADOWED rule (always
 * out-prioritised), satisfying the FR13.5 acceptance criterion.
 */
import type { HistoricalQuote, NegotiationRule } from './negotiation.types';

const INR = 'INR' as const;

/** FR13.6 starting rule set — every value here is illustrative and editable. */
export const ILLUSTRATIVE_RULES: NegotiationRule[] = [
  {
    rule_id: 'single_quote_no_negotiate',
    name: 'Only one quote received → do not negotiate (weak position)',
    priority: 5,
    scope: {},
    conditions: [{ field: 'quote_count', op: 'eq', value: 1 }],
    action: 'no_negotiate',
    params: {},
    enabled: true,
  },
  {
    rule_id: 'expiring_escalate',
    name: 'Validity < 24h → prioritise speed, escalate to ops',
    priority: 8,
    scope: {},
    conditions: [{ field: 'validity_hours_remaining', op: 'lt', value: 24 }],
    action: 'escalate_to_ops',
    params: {},
    enabled: true,
  },
  {
    rule_id: 'preferred_soft',
    name: 'Preferred supplier → soft single-round counter',
    priority: 10,
    scope: { supplier_tier: 'preferred' },
    conditions: [],
    action: 'counter',
    params: { target_basis: 'quote_minus_pct', value: 3, max_concession_pct: 5, rounds_allowed: 1 },
    enabled: true,
  },
  {
    rule_id: 'trackB_in_band_no_negotiate',
    name: 'Track B hotel quote within rate-card band → no negotiation',
    priority: 15,
    scope: { track: 'B' },
    conditions: [{ field: 'in_rate_card_band', op: 'eq', value: true }],
    action: 'no_negotiate',
    params: {},
    enabled: true,
  },
  {
    rule_id: 'over_budget_counter',
    name: 'Quote > 15% above budget → counter at budget + 5%',
    priority: 20,
    scope: {},
    conditions: [{ field: 'quote_vs_budget_pct', op: 'gt', value: 15 }],
    action: 'counter',
    params: { target_basis: 'budget', value: 5, max_concession_pct: 20 },
    enabled: true,
  },
  {
    rule_id: 'peak_season_cap',
    name: 'Peak-season window → counter to benchmark median, max 5% ask',
    priority: 30,
    scope: { season: 'peak' },
    conditions: [],
    action: 'counter',
    params: { target_basis: 'benchmark_median', value: 0, max_concession_pct: 5 },
    enabled: true,
  },
  {
    // DEAD by design: no corpus quote is from a 'reserve'-tier supplier.
    rule_id: 'reserve_tier_hold',
    name: 'Reserve-tier supplier → hold for ops review',
    priority: 40,
    scope: { supplier_tier: 'reserve' },
    conditions: [],
    action: 'hold',
    params: {},
    enabled: true,
  },
  {
    // SHADOWED by design: same predicate as over_budget_counter (priority 20),
    // which always fires first, so this never gets a turn.
    rule_id: 'over_budget_duplicate',
    name: 'Duplicate over-budget counter (lower priority, unreachable)',
    priority: 50,
    scope: {},
    conditions: [{ field: 'quote_vs_budget_pct', op: 'gt', value: 15 }],
    action: 'counter',
    params: { target_basis: 'quote_minus_pct', value: 10 },
    enabled: true,
  },
];

const AT = '2026-08-24T00:00:00Z';
const FAR = '2026-09-10T00:00:00Z';
const band = {
  median: { amount: 90_000, currency: INR },
  band_low: { amount: 80_000, currency: INR },
  band_high: { amount: 100_000, currency: INR },
  sample_size: 12,
};

/** Historical replay corpus (FR13.5). Every input is fully specified + dated. */
export const HISTORICAL_CORPUS: HistoricalQuote[] = [
  {
    quote_id: 'h-single',
    input: {
      quote: { quote_id: 'h-single', total: { amount: 100_000, currency: INR }, validity_ts: FAR, supplier_tier: 'primary' },
      target_total: { amount: 80_000, currency: INR },
      benchmark: band,
      round_no: 1,
      quote_count: 1,
      signals: { track: 'A', at: AT },
    },
  },
  {
    quote_id: 'h-expiring',
    input: {
      quote: { quote_id: 'h-expiring', total: { amount: 100_000, currency: INR }, validity_ts: '2026-08-24T10:00:00Z', supplier_tier: 'primary' },
      target_total: { amount: 90_000, currency: INR },
      benchmark: band,
      round_no: 1,
      quote_count: 3,
      signals: { track: 'A', at: AT },
    },
  },
  {
    quote_id: 'h-preferred',
    input: {
      quote: { quote_id: 'h-preferred', total: { amount: 120_000, currency: INR }, validity_ts: FAR, supplier_tier: 'preferred' },
      target_total: { amount: 100_000, currency: INR },
      benchmark: band,
      round_no: 1,
      quote_count: 3,
      signals: { track: 'A', at: AT },
    },
  },
  {
    quote_id: 'h-trackb',
    input: {
      quote: { quote_id: 'h-trackb', total: { amount: 95_000, currency: INR }, validity_ts: FAR, supplier_tier: 'primary' },
      target_total: { amount: 90_000, currency: INR },
      benchmark: band,
      round_no: 1,
      quote_count: 3,
      signals: { track: 'B', at: AT },
    },
  },
  {
    quote_id: 'h-overbudget',
    input: {
      quote: { quote_id: 'h-overbudget', total: { amount: 130_000, currency: INR }, validity_ts: FAR, supplier_tier: 'primary' },
      target_total: { amount: 100_000, currency: INR },
      benchmark: band,
      round_no: 1,
      quote_count: 3,
      signals: { track: 'A', at: AT },
    },
  },
  {
    quote_id: 'h-peak',
    input: {
      quote: { quote_id: 'h-peak', total: { amount: 90_000, currency: INR }, validity_ts: FAR, supplier_tier: 'primary' },
      target_total: { amount: 100_000, currency: INR },
      benchmark: band,
      round_no: 1,
      quote_count: 3,
      signals: { track: 'A', season: 'peak', at: AT },
    },
  },
];
