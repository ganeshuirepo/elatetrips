/**
 * M13 decision-engine + admin-config tests. Run (no runner is wired into
 * package.json, so invoke Node's built-in runner directly):
 *
 *   TS_NODE_TRANSPILE_ONLY=1 node -r ts-node/register --test \
 *     src/modules/negotiation/negotiation.decision.test.ts
 *
 * They prove the load-bearing guarantees: counters are engine-computed within the
 * customer target (BR-16), the 2-round cap and stop conditions hold (FR13.3),
 * the fairness floor is never breached, and the admin surface (dry-run gate,
 * dead/shadowed detection, rollback) behaves per FR13.4/13.5.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { decideNegotiation } from './negotiation.engine';
import { loadNegotiationConfig } from './negotiation.config';
import { NegotiationService } from './negotiation.service';
import { RuleSetStore } from './negotiation.store';
import { NegotiationAuditStore } from './negotiation.audit';
import { ILLUSTRATIVE_RULES, HISTORICAL_CORPUS } from './negotiation.fixtures';
import type { DecisionInput, NegotiationRule } from './negotiation.types';

const INR = 'INR' as const;
const emptyConfig = loadNegotiationConfig({});

const overBudgetRule: NegotiationRule = {
  rule_id: 'over_budget',
  name: 'over budget → budget +5%',
  priority: 20,
  scope: {},
  conditions: [{ field: 'quote_vs_budget_pct', op: 'gt', value: 15 }],
  action: 'counter',
  params: { target_basis: 'budget', value: 5, max_concession_pct: 20 },
  enabled: true,
};

const overBudgetInput = (round_no = 1): DecisionInput => ({
  quote: { quote_id: 'q1', rfq_id: 'r1', total: { amount: 130_000, currency: INR }, supplier_tier: 'primary' },
  target_total: { amount: 100_000, currency: INR },
  benchmark: {
    median: { amount: 90_000, currency: INR },
    band_low: { amount: 80_000, currency: INR },
    band_high: { amount: 100_000, currency: INR },
  },
  round_no,
  quote_count: 3,
  signals: { track: 'A', at: '2026-08-24T00:00:00Z' },
});

test('counter is engine-computed within the customer target (budget + 5%)', () => {
  const d = decideNegotiation(overBudgetInput(), [overBudgetRule], emptyConfig);
  assert.equal(d.action, 'counter');
  assert.equal(d.counter_amount?.amount, 105_000); // 100000 * 1.05
  assert.equal(d.counter_amount?.currency, INR);
  assert.equal(d.rule_id, 'over_budget');
});

test('BR-16: decision is deterministic and carries NO message text', () => {
  const a = decideNegotiation(overBudgetInput(), [overBudgetRule], emptyConfig);
  const b = decideNegotiation(overBudgetInput(), [overBudgetRule], emptyConfig);
  assert.deepEqual(a, b); // same inputs → identical output (no randomness/model)
  assert.equal(JSON.stringify(a).includes('message'), false); // engine drafts no words
});

test('2-round cap: round 3 stops regardless of rules (BR-16 hard guardrail)', () => {
  const d = decideNegotiation(overBudgetInput(3), [overBudgetRule], emptyConfig);
  assert.equal(d.action, 'stop');
  assert.equal(d.rule_id, 'guardrail:max_rounds');
  assert.ok(d.guardrails_applied.some((g) => g.startsWith('max_rounds')));
});

test('config cannot raise the cap above the BR-16 ceiling of 2', () => {
  const loose = loadNegotiationConfig({ NEGOTIATION_MAX_ROUNDS: '5' });
  assert.equal(loose.max_rounds, 2);
  const d = decideNegotiation(overBudgetInput(3), [overBudgetRule], loose);
  assert.equal(d.action, 'stop');
});

test('rounds_allowed stop condition fires before the hard cap', () => {
  const singleRound: NegotiationRule = { ...overBudgetRule, params: { ...overBudgetRule.params, rounds_allowed: 1 } };
  const d = decideNegotiation(overBudgetInput(2), [singleRound], emptyConfig);
  assert.equal(d.action, 'stop');
  assert.equal(d.rule_id, 'over_budget');
});

test('fairness floor is never breached', () => {
  const cfg = loadNegotiationConfig({ NEGOTIATION_FAIRNESS_FLOOR_PCT: '95' }); // floor = median*0.95 = 85500
  const greedy: NegotiationRule = {
    ...overBudgetRule,
    params: { target_basis: 'quote_minus_pct', value: 90 }, // would ask 130000*0.10 = 13000
  };
  const d = decideNegotiation({ ...overBudgetInput(), quote: { quote_id: 'q1', total: { amount: 130_000, currency: INR } } }, [greedy], cfg);
  assert.equal(d.action, 'counter');
  assert.equal(d.counter_amount?.amount, 85_500);
  assert.ok(d.guardrails_applied.includes('fairness_floor'));
});

test('mandatory default rule → deterministic no_negotiate when nothing matches', () => {
  const d = decideNegotiation(overBudgetInput(), [], emptyConfig);
  assert.equal(d.action, 'no_negotiate');
  assert.equal(d.rule_id, 'rule:default');
});

test('service.decide emits a negotiation.round with the engine amount only on counter', () => {
  const service = new NegotiationService({ config: emptyConfig, store: new RuleSetStore(), audit: new NegotiationAuditStore() });
  const report = service.dryRun(ILLUSTRATIVE_RULES);
  service.publish({ rules: ILLUSTRATIVE_RULES, published_by: 'ops', dry_run_id: report.dry_run_id });

  const d = service.decide(HISTORICAL_CORPUS.find((c) => c.quote_id === 'h-overbudget')!.input);
  assert.equal(d.action, 'counter');
  assert.equal(d.counter_amount?.amount, 105_000);

  const rounds = service.events({ type: 'negotiation.round' });
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].contract_event, true);
  assert.deepEqual(rounds[0].payload.amount, { amount: 105_000, currency: INR });
  assert.equal(rounds[0].payload.by, 'ai');
  assert.equal(rounds[0].payload.round_no, 1);
});

test('dry-run flags exactly one dead and one shadowed rule (FR13.5)', () => {
  const service = new NegotiationService({ config: emptyConfig, store: new RuleSetStore(), audit: new NegotiationAuditStore() });
  const report = service.dryRun(ILLUSTRATIVE_RULES);
  assert.deepEqual(report.dead_rules, ['reserve_tier_hold']);
  assert.deepEqual(report.shadowed_rules, ['over_budget_duplicate']);
  assert.equal(report.countered, 2); // h-preferred + h-overbudget (h-peak nets no concession)
});

test('publishing price rules without a matching dry-run is blocked (FR13.5)', () => {
  const service = new NegotiationService({ config: emptyConfig, store: new RuleSetStore(), audit: new NegotiationAuditStore() });
  assert.throws(() => service.publish({ rules: [overBudgetRule] }), /dry-run/);
});

test('rollback restores exact prior behaviour on replay (FR13.4)', () => {
  const service = new NegotiationService({ config: emptyConfig, store: new RuleSetStore(), audit: new NegotiationAuditStore() });
  const input = overBudgetInput();

  const r1 = service.dryRun([overBudgetRule]);
  const v1 = service.publish({ rules: [overBudgetRule], dry_run_id: r1.dry_run_id });
  assert.equal(service.decide(input).counter_amount?.amount, 105_000);

  const bumped: NegotiationRule = { ...overBudgetRule, params: { ...overBudgetRule.params, value: 10 } };
  const r2 = service.dryRun([bumped]);
  service.publish({ rules: [bumped], dry_run_id: r2.dry_run_id });
  assert.equal(service.decide(input).counter_amount?.amount, 110_000); // budget +10%

  const v3 = service.rollback(v1.version);
  assert.equal(v3.rolled_back_from, v1.version);
  assert.equal(service.decide(input).counter_amount?.amount, 105_000); // prior behaviour restored
});
