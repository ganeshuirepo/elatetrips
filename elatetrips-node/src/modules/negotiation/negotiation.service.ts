/**
 * NegotiationService — the use-case layer for M13. It orchestrates the pure
 * decision engine, the versioned rule-set store, the dry-run simulator and the
 * audit log; it holds no persistence details and no business literals (those come
 * from config + the rule data), so it is unit-testable with plain in-memory deps.
 *
 * Two responsibilities:
 *  1. DECIDE (BR-16 / M7 FR7.7): resolve the rule set effective for the request,
 *     run the pure engine, and — only when it says 'counter' — emit the frozen
 *     `negotiation.round` event carrying the ENGINE-computed amount. The message
 *     text is never produced here; an LLM drafts it downstream. This is the proof
 *     that the number is rule-derived, never model-derived.
 *  2. ADMIN CONFIG (FR13.4/13.5): CRUD over versioned rule sets, effective dating,
 *     one-click rollback, and a dry-run that replays a candidate set over a
 *     historical corpus. Publishing a set that contains price (counter) rules is
 *     blocked unless a matching dry-run cleared it first.
 */
import { UnprocessableEntityError } from '../../common/errors/AppError';
import type { NegotiationAuditStore, NegotiationEvent, NegotiationEventType } from './negotiation.audit';
import type { NegotiationConfig } from './negotiation.config';
import { decideNegotiation, firstMatchingRule } from './negotiation.engine';
import type { RuleSetStore } from './negotiation.store';
import { HISTORICAL_CORPUS } from './negotiation.fixtures';
import type {
  DecisionInput,
  DecisionOutput,
  DryRunReport,
  HistoricalQuote,
  NegotiationRule,
  RuleReachability,
  RuleSetVersion,
} from './negotiation.types';

export interface NegotiationDeps {
  config: NegotiationConfig;
  store: RuleSetStore;
  audit: NegotiationAuditStore;
  now?: () => Date;
  /** Default corpus for dry-runs when the caller supplies none. */
  corpus?: HistoricalQuote[];
}

export interface PublishRequest {
  rules: NegotiationRule[];
  published_by?: string;
  effective_from?: string;
  effective_to?: string;
  dry_run_id?: string;
  note?: string;
}

/** Stable, order-independent signature of a rule set, binding a dry-run to it. */
function rulesHash(rules: NegotiationRule[]): string {
  const normalised = [...rules]
    .map((r) => JSON.stringify(r, Object.keys(r).sort()))
    .sort()
    .join('|');
  // Small deterministic string hash — enough to detect a changed candidate.
  let h = 0;
  for (let i = 0; i < normalised.length; i += 1) {
    h = (h * 31 + normalised.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(36)}_${rules.length}`;
}

function hasPriceRule(rules: NegotiationRule[]): boolean {
  return rules.some((r) => r.action === 'counter');
}

export class NegotiationService {
  private readonly config: NegotiationConfig;
  private readonly store: RuleSetStore;
  private readonly audit: NegotiationAuditStore;
  private readonly now: () => Date;
  private readonly corpus: HistoricalQuote[];
  /** dry_run_id → the rules signature it was run against (publish gate). */
  private readonly clearedDryRuns = new Map<string, string>();
  private dryRunCounter = 0;

  constructor(deps: NegotiationDeps) {
    this.config = deps.config;
    this.store = deps.store;
    this.audit = deps.audit;
    this.now = deps.now ?? ((): Date => new Date());
    this.corpus = deps.corpus ?? HISTORICAL_CORPUS;
    // BR-17: seed only if an operator supplied rules via config; else stay empty.
    if (this.config.seed_rules.length && this.store.size === 0) {
      this.store.publish({ rules: this.config.seed_rules, published_by: 'system:seed', note: 'config seed' });
    }
  }

  getConfig(): NegotiationConfig {
    return this.config;
  }

  /** Audit trail, optionally filtered by quote and/or event type. */
  events(filter: { quote_id?: string; type?: NegotiationEventType } = {}): readonly NegotiationEvent[] {
    let events = filter.quote_id ? this.audit.bySubject({ quote_id: filter.quote_id }) : this.audit.all();
    if (filter.type) events = events.filter((e) => e.type === filter.type);
    return events;
  }

  // ---- Decision path (BR-16 / M7 FR7.7) ------------------------------------

  /**
   * Decide the economics of one negotiation step and, when the verdict is a
   * counter, emit `negotiation.round` with the engine-computed amount. The
   * `by: 'ai'` actor reflects that the AI agent *sends* the round, but the
   * amount in the payload came from the deterministic engine, not the model.
   */
  decide(input: DecisionInput, actor: 'ai' | 'ops' = 'ai'): DecisionOutput {
    const active = this.store.activeAt(input.signals?.at);
    const rules = active?.rules ?? [];
    const decision = decideNegotiation(input, rules, this.config);

    // Module-local explainability record (FR13.2). Not a frozen contract event.
    this.audit.append({
      type: 'rule.evaluated',
      actor,
      actor_id: actor,
      role: actor === 'ops' ? 'ops' : 'platform',
      subject: { rfq_id: input.quote.rfq_id, quote_id: input.quote.quote_id },
      payload: {
        rule_id: decision.rule_id,
        action: decision.action,
        round_no: decision.round_no,
        rule_set_version: active?.version ?? null,
        guardrails_applied: decision.guardrails_applied,
        reason: decision.rationale.reason,
      },
    });

    if (decision.action === 'counter' && decision.counter_amount) {
      // Frozen contract event (events.md): the engine set `amount`; an LLM will
      // draft the accompanying message text elsewhere (BR-16).
      this.audit.append({
        type: 'negotiation.round',
        actor,
        actor_id: actor,
        role: actor === 'ops' ? 'ops' : 'platform',
        subject: { rfq_id: input.quote.rfq_id, quote_id: input.quote.quote_id },
        payload: {
          quote_id: input.quote.quote_id,
          by: actor,
          amount: decision.counter_amount,
          round_no: decision.round_no,
          rule_id: decision.rule_id,
        },
      });
    }

    return decision;
  }

  // ---- Admin config: versioned rule sets (FR13.4) --------------------------

  listVersions(): readonly RuleSetVersion[] {
    return this.store.list();
  }

  getVersion(version: number): RuleSetVersion {
    return this.store.get(version);
  }

  activeRuleSet(atIso?: string): RuleSetVersion | undefined {
    return this.store.activeAt(atIso);
  }

  /**
   * Publish a new version. If the set contains any counter (price) rule, a
   * dry-run that matches this exact candidate must have cleared first (FR13.5).
   */
  publish(req: PublishRequest): RuleSetVersion {
    const rules = req.rules ?? [];
    if (hasPriceRule(rules)) {
      const signature = rulesHash(rules);
      const cleared = req.dry_run_id ? this.clearedDryRuns.get(req.dry_run_id) : undefined;
      if (!cleared || cleared !== signature) {
        throw new UnprocessableEntityError(
          'Publishing a rule set with price (counter) rules requires a matching dry-run first (FR13.5).',
          { need: 'dry_run_id', matches_candidate: cleared === signature },
        );
      }
    }
    const version = this.store.publish({
      rules,
      published_by: req.published_by ?? 'ops',
      effective_from: req.effective_from,
      effective_to: req.effective_to,
      dry_run_id: req.dry_run_id,
      note: req.note,
    });
    this.audit.append({
      type: 'rule.published',
      actor: 'ops',
      actor_id: req.published_by ?? 'ops',
      role: 'ops',
      subject: {},
      payload: { version: version.version, rule_count: rules.length, dry_run_id: req.dry_run_id ?? null },
    });
    return version;
  }

  /**
   * One-click rollback (FR13.4): republish a prior version's rules verbatim as a
   * new version, so the exact prior behaviour is restored on replay while history
   * stays append-only. No dry-run gate: these rules already ran in production.
   */
  rollback(toVersion: number, actor = 'ops'): RuleSetVersion {
    const prior = this.store.get(toVersion);
    const version = this.store.publish({
      rules: prior.rules,
      published_by: actor,
      effective_from: prior.effective_from,
      effective_to: prior.effective_to,
      rolled_back_from: toVersion,
      note: `rollback to v${toVersion}`,
    });
    this.audit.append({
      type: 'rule.rolled_back',
      actor: 'ops',
      actor_id: actor,
      role: 'ops',
      subject: {},
      payload: { version: version.version, restored_from: toVersion },
    });
    return version;
  }

  // ---- Dry-run simulation (FR13.5) -----------------------------------------

  /**
   * Replay a candidate rule set over the historical corpus and report how many
   * quotes would be countered, the concession asked, which rules never fire
   * (dead) and which are unreachable behind higher-priority rules (shadowed).
   * The returned dry_run_id then unlocks publishing this exact candidate.
   */
  dryRun(candidate: NegotiationRule[], corpus: HistoricalQuote[] = this.corpus): DryRunReport {
    this.dryRunCounter += 1;
    const dry_run_id = `dry-${this.dryRunCounter.toString().padStart(3, '0')}`;

    const decisions = corpus.map((c) => ({
      item: c,
      decision: decideNegotiation(c.input, candidate, this.config),
    }));

    const firedCount = new Map<string, number>();
    let countered = 0;
    let totalConcession = 0;
    const concessionPcts: number[] = [];

    for (const { item, decision } of decisions) {
      firedCount.set(decision.rule_id, (firedCount.get(decision.rule_id) ?? 0) + 1);
      if (decision.action === 'counter' && decision.counter_amount) {
        countered += 1;
        const asked = item.input.quote.total.amount - decision.counter_amount.amount;
        totalConcession += asked;
        concessionPcts.push((asked / item.input.quote.total.amount) * 100);
      }
    }

    // Reachability: standalone match (rule alone) vs. actual fires.
    const reachability: RuleReachability[] = candidate.map((rule) => {
      const standalone = corpus.filter((c) => {
        const atMs = c.input.signals?.at ? new Date(c.input.signals.at).getTime() : this.now().getTime();
        return firstMatchingRule([rule], c.input, atMs)?.rule_id === rule.rule_id;
      });
      const fired = firedCount.get(rule.rule_id) ?? 0;
      const dead = standalone.length === 0;
      // Shadowed: its predicate DOES match somewhere, but it never actually fires
      // because a higher-priority rule always pre-empts it.
      const shadowed = !dead && fired === 0;
      let shadowed_by: string | undefined;
      if (shadowed) {
        const firstItem = standalone[0];
        const atMs = firstItem.input.signals?.at ? new Date(firstItem.input.signals.at).getTime() : this.now().getTime();
        shadowed_by = firstMatchingRule(candidate, firstItem.input, atMs)?.rule_id;
      }
      return { rule_id: rule.rule_id, name: rule.name, fired_count: fired, dead, shadowed_by };
    });

    const dead_rules = reachability.filter((r) => r.dead).map((r) => r.rule_id);
    const shadowed_rules = reachability.filter((r) => !r.dead && r.shadowed_by).map((r) => r.rule_id);

    const report: DryRunReport = {
      dry_run_id,
      ts: this.now().toISOString(),
      corpus_size: corpus.length,
      countered,
      total_concession_asked: totalConcession,
      avg_concession_pct:
        concessionPcts.length ? concessionPcts.reduce((a, b) => a + b, 0) / concessionPcts.length : 0,
      reachability,
      dead_rules,
      shadowed_rules,
      delta_vs_active: this.deltaVsActive(decisions),
    };

    this.clearedDryRuns.set(dry_run_id, rulesHash(candidate));
    return report;
  }

  /** "Would have changed N counters by ₹X" vs. the currently active version. */
  private deltaVsActive(
    candidateDecisions: { item: HistoricalQuote; decision: DecisionOutput }[],
  ): DryRunReport['delta_vs_active'] {
    const active = this.store.activeAt();
    if (!active) return undefined;

    let changed = 0;
    let concessionDelta = 0;
    for (const { item, decision } of candidateDecisions) {
      const before = decideNegotiation(item.input, active.rules, this.config);
      const beforeAmt = before.action === 'counter' ? before.counter_amount?.amount ?? null : null;
      const afterAmt = decision.action === 'counter' ? decision.counter_amount?.amount ?? null : null;
      if (beforeAmt !== afterAmt || before.action !== decision.action) changed += 1;
      const beforeAsked = beforeAmt === null ? 0 : item.input.quote.total.amount - beforeAmt;
      const afterAsked = afterAmt === null ? 0 : item.input.quote.total.amount - afterAmt;
      concessionDelta += afterAsked - beforeAsked;
    }
    return {
      changed_counters: changed,
      concession_delta: concessionDelta,
      summary: `Would change ${changed} decision(s); net concession delta ${concessionDelta} minor units vs. active v${active.version}.`,
    };
  }
}
