/**
 * M13 — Negotiation Rule Engine & Admin Configuration: the module's type surface.
 *
 * Two halves live here, matching BR-16 + BR-17:
 *  - The RULE model (FR13.1) and its versioning wrappers — the *technical* half
 *    the engine ships now; the actual rule rows are *business* data supplied via
 *    admin CRUD / config, never hard-coded.
 *  - The DECISION contract — the pure engine's input/output. The engine decides
 *    ONLY the economics (whether to counter, the counter amount, when to stop);
 *    an LLM elsewhere drafts the words. No message text is produced here.
 *
 * Money mirrors the frozen contracts-v1.1 `money` def (integer MINOR units +
 * explicit currency); it is redeclared locally so the module stays self-contained
 * and never reaches into another module's source.
 */

export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED';

/** Money in integer MINOR units + explicit currency (contracts-v1.1 `money`). */
export interface Money {
  amount: number;
  currency: Currency;
}

// ---- Rule model (FR13.1) ----------------------------------------------------

/** What a matching rule tells the engine to do. */
export type RuleAction =
  | 'counter'
  | 'accept'
  | 'hold'
  | 'escalate_to_ops'
  | 'no_negotiate';

/** How the counter target price is derived when action = 'counter'. */
export type TargetBasis = 'budget' | 'benchmark_median' | 'quote_minus_pct';

/** Comparison operators available to a rule condition. */
export type ConditionOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'in' | 'nin';

/**
 * A single AND-ed predicate over a derived decision signal (see
 * DECISION_SIGNAL_FIELDS in the engine). `value` is compared with the signal
 * using `op`; `in`/`nin` expect an array.
 */
export interface RuleCondition {
  field: string;
  op: ConditionOp;
  value: number | string | boolean | (number | string)[];
}

/**
 * Scope narrows a rule to a slice of the marketplace. An absent / empty field is
 * a wildcard (matches anything). Array fields match when they contain the
 * request's value; scalar fields match on equality.
 */
export interface RuleScope {
  destination?: string[];
  track?: 'A' | 'B';
  season?: string;
  date_window?: { from: string; to: string };
  supplier_tier?: 'primary' | 'bench' | 'reserve' | 'preferred';
  occasion_type?: string;
  budget_band?: string;
}

/** Tunables the action carries (FR13.1 params{}). */
export interface RuleParams {
  target_basis?: TargetBasis;
  /** For budget/benchmark: % added on top; for quote_minus_pct: % shaved off. */
  value?: number;
  /** Hard cap on how much concession the counter may ask of the supplier (%). */
  max_concession_pct?: number;
  /** Rounds this rule permits (still clamped by the hard 2-round guardrail). */
  rounds_allowed?: number;
}

/** One rule (FR13.1). `version` is stamped by the store on publish. */
export interface NegotiationRule {
  rule_id: string;
  name: string;
  priority: number;
  scope: RuleScope;
  conditions: RuleCondition[];
  action: RuleAction;
  params: RuleParams;
  enabled: boolean;
  effective_from?: string;
  effective_to?: string;
}

// ---- Versioned rule sets (FR13.4) -------------------------------------------

/** One immutable, published snapshot of the whole rule set. */
export interface RuleSetVersion {
  version: number;
  rules: NegotiationRule[];
  effective_from?: string;
  effective_to?: string;
  published_by: string;
  published_ts: string;
  /** When this version is a rollback, the version it restored. */
  rolled_back_from?: number;
  /** The dry-run that cleared this version for publish (price rules require one). */
  dry_run_id?: string;
  note?: string;
}

// ---- Decision contract (BR-16) ----------------------------------------------

/**
 * A benchmark band for the destination/season — historical quotes + master-DB
 * rates, computed upstream (M0/M7) and passed in. The engine treats it as given
 * data: it never fabricates a band, and cites only these true numbers.
 */
export interface BenchmarkBand {
  median: Money;
  band_low: Money;
  band_high: Money;
  /** How many comparable quotes fed the band (provenance, for explainability). */
  sample_size?: number;
}

/** The signals the engine decides on for one negotiation step. */
export interface DecisionInput {
  quote: {
    quote_id: string;
    rfq_id?: string;
    total: Money;
    validity_ts?: string;
    supplier_tier?: RuleScope['supplier_tier'];
  };
  /** Customer's optional stated budget target on the shortlisted quote (FR7.7). */
  target_total?: Money;
  benchmark?: BenchmarkBand;
  /** The round about to be attempted, 1-based. */
  round_no: number;
  /** How many quotes the customer received for this RFQ (weak-position rule). */
  quote_count?: number;
  /** Scope signals used to match rules. */
  signals?: {
    destination?: string;
    track?: 'A' | 'B';
    season?: string;
    occasion_type?: string;
    budget_band?: string;
    /** ISO instant used for effective-dating; defaults to now(). */
    at?: string;
  };
}

/** Terminal-ish action after guardrails: adds 'stop' (round cap hit). */
export type DecisionAction = RuleAction | 'stop';

/** The engine's verdict for one step — economics only, never message text. */
export interface DecisionOutput {
  action: DecisionAction;
  /** Present only when action = 'counter'; engine-computed, never model-derived. */
  counter_amount?: Money;
  /** The rule that fired (or the synthetic default rule id). */
  rule_id: string;
  round_no: number;
  /** Guardrails that altered the raw rule outcome, for the audit trail. */
  guardrails_applied: string[];
  /**
   * Full explainability record (FR13.2): the inputs snapshot + why this rule
   * fired, so any counter can be explained months later.
   */
  rationale: {
    fired_rule_name?: string;
    reason: string;
    target_basis?: TargetBasis;
    inputs_snapshot: Record<string, unknown>;
  };
}

// ---- Dry-run report (FR13.5) ------------------------------------------------

/** One historical quote in the replay corpus. */
export interface HistoricalQuote {
  quote_id: string;
  input: DecisionInput;
}

/** Per-rule reachability finding from a dry-run. */
export interface RuleReachability {
  rule_id: string;
  name: string;
  fired_count: number;
  dead: boolean;
  shadowed_by?: string;
}

/** The replay report a rule set must clear before publishing price rules. */
export interface DryRunReport {
  dry_run_id: string;
  ts: string;
  corpus_size: number;
  countered: number;
  /** Sum of asked concession (quote.total − counter_amount) in minor units. */
  total_concession_asked: number;
  avg_concession_pct: number;
  reachability: RuleReachability[];
  dead_rules: string[];
  shadowed_rules: string[];
  /** Delta vs. the currently active version, when one exists. */
  delta_vs_active?: {
    changed_counters: number;
    concession_delta: number;
    summary: string;
  };
}
