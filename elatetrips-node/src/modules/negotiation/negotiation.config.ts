/**
 * M13 negotiation configuration (BR-17). Every business value the engine leans
 * on — the round cap, the supplier-fairness floor, the default-rule action, the
 * money rounding step, and the seed rule set — is read HERE from the environment,
 * never hard-coded in the engine. Defaults are inert: an empty rule set, a
 * conservative `no_negotiate` default action, and the hard 2-round guardrail.
 *
 * The one literal that is NOT configurable is the ceiling on rounds: BR-16 caps
 * negotiation at 2 rounds per quote and no config or rule may raise it. A config
 * value is honoured only when it is *lower* (an operator may be stricter).
 */
import type { NegotiationRule, RuleAction } from './negotiation.types';

export type ConfigSource = Record<string, string | undefined>;

/** BR-16 hard ceiling — the highest round the engine will ever counter on. */
export const HARD_MAX_ROUNDS = 2;

export interface NegotiationConfig {
  /** Effective round cap = min(configured, HARD_MAX_ROUNDS). */
  max_rounds: number;
  /** Action taken by the mandatory default rule when nothing else matches. */
  default_action: RuleAction;
  /**
   * Supplier-fairness floor as a % of the benchmark median: the engine never
   * counters below median × pct/100. Undefined → the benchmark band_low (if
   * supplied) is the only floor; absent both → no floor.
   */
  fairness_floor_pct?: number;
  /** Money rounding step in minor units for computed counters (default 1). */
  rounding_minor_units: number;
  /** Seed rule set (business data, editable via admin CRUD). Default empty. */
  seed_rules: NegotiationRule[];
}

const KEYS = {
  maxRounds: 'NEGOTIATION_MAX_ROUNDS',
  defaultAction: 'NEGOTIATION_DEFAULT_ACTION',
  fairnessFloorPct: 'NEGOTIATION_FAIRNESS_FLOOR_PCT',
  rounding: 'NEGOTIATION_ROUNDING_MINOR_UNITS',
  seedRules: 'NEGOTIATION_SEED_RULES',
} as const;

const DEFAULT_ACTIONS: readonly RuleAction[] = [
  'counter',
  'accept',
  'hold',
  'escalate_to_ops',
  'no_negotiate',
];

function readInt(src: ConfigSource, key: string): number | undefined {
  const raw = src[key];
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

function readJsonArray<T>(src: ConfigSource, key: string): T[] {
  const raw = src[key];
  if (raw === undefined || raw.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function loadNegotiationConfig(source?: ConfigSource): NegotiationConfig {
  const src: ConfigSource = source ?? process.env;

  const configuredMax = readInt(src, KEYS.maxRounds);
  // Honour a configured cap only when it is stricter than the BR-16 ceiling.
  const max_rounds =
    configuredMax === undefined
      ? HARD_MAX_ROUNDS
      : Math.max(0, Math.min(configuredMax, HARD_MAX_ROUNDS));

  const rawDefault = src[KEYS.defaultAction]?.trim() as RuleAction | undefined;
  const default_action =
    rawDefault && DEFAULT_ACTIONS.includes(rawDefault) ? rawDefault : 'no_negotiate';

  const rounding = readInt(src, KEYS.rounding);

  return {
    max_rounds,
    default_action,
    fairness_floor_pct: readInt(src, KEYS.fairnessFloorPct),
    rounding_minor_units: rounding && rounding > 0 ? rounding : 1,
    seed_rules: readJsonArray<NegotiationRule>(src, KEYS.seedRules),
  };
}

export const NEGOTIATION_CONFIG_KEYS = KEYS;
