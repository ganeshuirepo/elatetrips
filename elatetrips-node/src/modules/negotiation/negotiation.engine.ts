/**
 * M13 decision engine — a PURE, DETERMINISTIC function. This is the whole point
 * of BR-16: rules (data) decide the economics of a negotiation; a model NEVER
 * does. Given a quote, an optional customer target, a benchmark band and the
 * round number, it returns which action to take and — when countering — the
 * exact counter amount, computed here by arithmetic from config + rule params.
 *
 * It is a plain function with no I/O, no clock (the caller passes `at`), no
 * randomness and no model call, so the same inputs always yield the same output
 * and every counter is explainable months later (FR13.2).
 *
 * Hard guardrails (FR13.3) wrap whatever a rule asks for and CANNOT be overridden
 * by any rule: at most HARD_MAX_ROUNDS rounds; never counter below the
 * supplier-fairness floor; only cite true numbers (the engine emits no message
 * text at all, so it cannot fabricate a competing offer). Locked itinerary items
 * are never touched — the engine decides a price, never a line item.
 */
import type { NegotiationConfig } from './negotiation.config';
import { HARD_MAX_ROUNDS } from './negotiation.config';
import type {
  BenchmarkBand,
  DecisionInput,
  DecisionOutput,
  Money,
  NegotiationRule,
  RuleCondition,
  TargetBasis,
} from './negotiation.types';

/** The named signals a rule condition may test (documented surface for admins). */
export const DECISION_SIGNAL_FIELDS = [
  'quote_vs_budget_pct',
  'quote_vs_benchmark_median_pct',
  'quote_count',
  'validity_hours_remaining',
  'supplier_tier',
  'track',
  'in_rate_card_band',
  'season',
  'occasion_type',
  'budget_band',
  'destination',
] as const;

type SignalValue = number | string | boolean | undefined;

/** Derive every rule-testable signal from the raw decision input. */
function deriveSignals(input: DecisionInput): Record<string, SignalValue> {
  const nowIso = input.signals?.at;
  const now = nowIso ? new Date(nowIso).getTime() : Date.now();
  const quoteTotal = input.quote.total.amount;

  const budgetPct =
    input.target_total && input.target_total.amount > 0
      ? ((quoteTotal - input.target_total.amount) / input.target_total.amount) * 100
      : undefined;

  const median = input.benchmark?.median.amount;
  const benchPct =
    median && median > 0 ? ((quoteTotal - median) / median) * 100 : undefined;

  const validityHours = input.quote.validity_ts
    ? (new Date(input.quote.validity_ts).getTime() - now) / 3_600_000
    : undefined;

  const inBand = input.benchmark
    ? quoteTotal >= input.benchmark.band_low.amount &&
      quoteTotal <= input.benchmark.band_high.amount
    : undefined;

  return {
    quote_vs_budget_pct: budgetPct,
    quote_vs_benchmark_median_pct: benchPct,
    quote_count: input.quote_count,
    validity_hours_remaining: validityHours,
    supplier_tier: input.quote.supplier_tier,
    track: input.signals?.track,
    in_rate_card_band: inBand,
    season: input.signals?.season,
    occasion_type: input.signals?.occasion_type,
    budget_band: input.signals?.budget_band,
    destination: input.signals?.destination,
  };
}

function compare(op: RuleCondition['op'], actual: SignalValue, expected: RuleCondition['value']): boolean {
  if (op === 'in' || op === 'nin') {
    const arr = Array.isArray(expected) ? expected : [expected];
    const hit = arr.some((v) => v === actual);
    return op === 'in' ? hit : !hit;
  }
  if (op === 'eq') return actual === expected;
  if (op === 'neq') return actual !== expected;
  // Numeric comparisons: only meaningful when both sides are numbers.
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;
  switch (op) {
    case 'gt':
      return actual > expected;
    case 'gte':
      return actual >= expected;
    case 'lt':
      return actual < expected;
    case 'lte':
      return actual <= expected;
    default:
      return false;
  }
}

/** Scope matches when every present field admits the request (absent = wildcard). */
function scopeMatches(rule: NegotiationRule, input: DecisionInput, atMs: number): boolean {
  const s = rule.scope;
  const sig = input.signals ?? {};
  if (s.destination?.length && (!sig.destination || !s.destination.includes(sig.destination))) return false;
  if (s.track && sig.track !== s.track) return false;
  if (s.season && sig.season !== s.season) return false;
  if (s.occasion_type && sig.occasion_type !== s.occasion_type) return false;
  if (s.budget_band && sig.budget_band !== s.budget_band) return false;
  if (s.supplier_tier && input.quote.supplier_tier !== s.supplier_tier) return false;
  if (s.date_window) {
    const from = new Date(s.date_window.from).getTime();
    const to = new Date(s.date_window.to).getTime();
    if (atMs < from || atMs > to) return false;
  }
  return true;
}

/** A rule is live when enabled and `at` falls inside its effective window. */
function isEffective(rule: NegotiationRule, atMs: number): boolean {
  if (!rule.enabled) return false;
  if (rule.effective_from && atMs < new Date(rule.effective_from).getTime()) return false;
  if (rule.effective_to && atMs > new Date(rule.effective_to).getTime()) return false;
  return true;
}

/**
 * Rules in evaluation order: lower `priority` first (higher precedence), ties
 * broken by rule_id so ordering is fully deterministic (AC: priority ordering
 * deterministic incl. two overlapping rules).
 */
export function orderRules(rules: NegotiationRule[]): NegotiationRule[] {
  return [...rules].sort((a, b) => a.priority - b.priority || a.rule_id.localeCompare(b.rule_id));
}

/** First enabled, in-scope, condition-satisfying rule in priority order. */
export function firstMatchingRule(
  rules: NegotiationRule[],
  input: DecisionInput,
  atMs: number,
): NegotiationRule | undefined {
  const signals = deriveSignals(input);
  return orderRules(rules).find(
    (rule) =>
      isEffective(rule, atMs) &&
      scopeMatches(rule, input, atMs) &&
      rule.conditions.every((c) => compare(c.op, signals[c.field], c.value)),
  );
}

function roundTo(amount: number, step: number): number {
  return Math.round(amount / step) * step;
}

/** Raw counter target from the rule's target_basis, before guardrails. */
function rawCounterTarget(
  rule: NegotiationRule,
  input: DecisionInput,
): { amount: number; basis: TargetBasis } | null {
  const basis = rule.params.target_basis ?? 'quote_minus_pct';
  const pct = rule.params.value ?? 0;
  const quoteTotal = input.quote.total.amount;
  if (basis === 'budget') {
    if (!input.target_total) return null;
    return { amount: input.target_total.amount * (1 + pct / 100), basis };
  }
  if (basis === 'benchmark_median') {
    if (!input.benchmark) return null;
    return { amount: input.benchmark.median.amount * (1 + pct / 100), basis };
  }
  // quote_minus_pct: shave pct off the supplier's quoted total.
  return { amount: quoteTotal * (1 - pct / 100), basis };
}

/** The supplier-fairness floor in minor units (0 = no floor). */
function fairnessFloor(config: NegotiationConfig, benchmark?: BenchmarkBand): number {
  const fromPct =
    config.fairness_floor_pct !== undefined && benchmark
      ? benchmark.median.amount * (config.fairness_floor_pct / 100)
      : undefined;
  const fromBand = benchmark?.band_low.amount;
  return Math.max(fromPct ?? 0, fromBand ?? 0);
}

const money = (amount: number, currency: Money['currency']): Money => ({ amount, currency });

/**
 * The pure decision. `config.default_action` backs the mandatory default rule so
 * behaviour is deterministic even when the rule set is empty (FR13.2).
 */
export function decideNegotiation(
  input: DecisionInput,
  rules: NegotiationRule[],
  config: NegotiationConfig,
): DecisionOutput {
  const atMs = input.signals?.at ? new Date(input.signals.at).getTime() : Date.now();
  const currency = input.quote.total.currency;
  const guardrails: string[] = [];

  const snapshot: Record<string, unknown> = {
    quote_total: input.quote.total.amount,
    currency,
    target_total: input.target_total?.amount ?? null,
    benchmark_median: input.benchmark?.median.amount ?? null,
    round_no: input.round_no,
    quote_count: input.quote_count ?? null,
    at: input.signals?.at ?? null,
  };

  // ---- Guardrail 1 (hard): round cap. Nothing below can raise this. --------
  const effectiveMax = Math.min(config.max_rounds, HARD_MAX_ROUNDS);
  if (input.round_no > effectiveMax) {
    return {
      action: 'stop',
      rule_id: 'guardrail:max_rounds',
      round_no: input.round_no,
      guardrails_applied: [`max_rounds(${effectiveMax})`],
      rationale: {
        reason: `Round ${input.round_no} exceeds the ${effectiveMax}-round cap (BR-16); negotiation stops.`,
        inputs_snapshot: snapshot,
      },
    };
  }

  const matched = firstMatchingRule(rules, input, atMs);

  // ---- Mandatory default rule: deterministic when nothing matches. ----------
  if (!matched) {
    return {
      action: config.default_action,
      rule_id: 'rule:default',
      round_no: input.round_no,
      guardrails_applied: guardrails,
      rationale: {
        reason: `No rule matched; mandatory default action '${config.default_action}' applied.`,
        inputs_snapshot: snapshot,
      },
    };
  }

  // A rule may also cap rounds below the guardrail.
  if (matched.params.rounds_allowed !== undefined && input.round_no > matched.params.rounds_allowed) {
    return {
      action: 'stop',
      rule_id: matched.rule_id,
      round_no: input.round_no,
      guardrails_applied: [`rounds_allowed(${matched.params.rounds_allowed})`],
      rationale: {
        fired_rule_name: matched.name,
        reason: `Rule '${matched.name}' allows ${matched.params.rounds_allowed} round(s); round ${input.round_no} stops.`,
        inputs_snapshot: snapshot,
      },
    };
  }

  // Non-counter actions pass straight through (accept / hold / escalate / no_negotiate).
  if (matched.action !== 'counter') {
    return {
      action: matched.action,
      rule_id: matched.rule_id,
      round_no: input.round_no,
      guardrails_applied: guardrails,
      rationale: {
        fired_rule_name: matched.name,
        reason: `Rule '${matched.name}' → ${matched.action}.`,
        inputs_snapshot: snapshot,
      },
    };
  }

  // ---- action = 'counter': compute the amount deterministically. -----------
  const raw = rawCounterTarget(matched, input);
  if (raw === null) {
    // The rule wanted a counter but its basis needs data we don't have
    // (e.g. target_basis 'budget' with no customer target). Fail safe: hold.
    guardrails.push('counter_basis_unavailable');
    return {
      action: 'hold',
      rule_id: matched.rule_id,
      round_no: input.round_no,
      guardrails_applied: guardrails,
      rationale: {
        fired_rule_name: matched.name,
        reason: `Rule '${matched.name}' asked to counter on '${matched.params.target_basis}' but that input was absent; holding rather than guessing.`,
        target_basis: matched.params.target_basis,
        inputs_snapshot: snapshot,
      },
    };
  }

  const quoteTotal = input.quote.total.amount;
  let target = raw.amount;

  // Guardrail 2 (hard): max concession — never ask the supplier to drop more
  // than the rule's configured ceiling below their quoted total.
  if (matched.params.max_concession_pct !== undefined) {
    const floorByConcession = quoteTotal * (1 - matched.params.max_concession_pct / 100);
    if (target < floorByConcession) {
      target = floorByConcession;
      guardrails.push(`max_concession_pct(${matched.params.max_concession_pct})`);
    }
  }

  // Guardrail 3 (hard): supplier-fairness floor — never counter below it.
  const floor = fairnessFloor(config, input.benchmark);
  if (floor > 0 && target < floor) {
    target = floor;
    guardrails.push('fairness_floor');
  }

  const counterAmount = roundTo(target, config.rounding_minor_units);

  // If the "counter" asks for at-or-above the quoted price, there is nothing to
  // negotiate — accept rather than send a pointless (or upward) counter.
  if (counterAmount >= quoteTotal) {
    guardrails.push('no_concession→accept');
    return {
      action: 'accept',
      rule_id: matched.rule_id,
      round_no: input.round_no,
      guardrails_applied: guardrails,
      rationale: {
        fired_rule_name: matched.name,
        reason: `Rule '${matched.name}' produced no concession vs. the quoted total; accepting.`,
        target_basis: raw.basis,
        inputs_snapshot: snapshot,
      },
    };
  }

  return {
    action: 'counter',
    counter_amount: money(counterAmount, currency),
    rule_id: matched.rule_id,
    round_no: input.round_no,
    guardrails_applied: guardrails,
    rationale: {
      fired_rule_name: matched.name,
      reason: `Rule '${matched.name}' counters at ${counterAmount} (${matched.params.target_basis ?? 'quote_minus_pct'} basis).`,
      target_basis: matched.params.target_basis,
      inputs_snapshot: { ...snapshot, computed_target: raw.amount, counter_amount: counterAmount },
    },
  };
}
