/**
 * Classifier configuration (BR-17 — no hard-coded business values). Every
 * threshold, band and escalation list is READ HERE from env, never baked into
 * the rules. Defaults are EMPTY/undefined: the classifier ships INERT — with no
 * config, no threshold-gated rule fires and the mandatory default rule routes
 * everything to DMC (the safe, asymmetric-bias default of FR12.2). An operator
 * supplies real policy as data later. There is intentionally NOT a single
 * business literal in this file.
 */

export type ConfigSource = Record<string, string | undefined>;

export interface ClassifierConfig {
  /** Hotel (Track B) is only chosen when confidence >= this (FR12.2). undefined → hotel route unreachable. */
  hotel_confidence_min?: number;
  /** Confidence in [dual_band_min, hotel_confidence_min) → dual route (FR12.3). */
  dual_band_min?: number;
  /** Guest count strictly above this forces DMC (FR12.1). undefined → not evaluated. */
  guest_count_max?: number;
  /** Trip nights at or below this counts as a "short duration" hotel signal (FR12.1). */
  max_duration_nights?: number;
  /** budget_per_night.amount (minor units) at or below this counts as "within band" (FR12.1). */
  hotel_budget_max?: number;
  /** Celebration kinds that escalate to the celebration/wedding manager (e.g. ["wedding"]). */
  escalation_celebration_kinds: string[];
  /** Occasion types that escalate to the celebration/wedding manager (optional). */
  escalation_occasion_types: string[];
}

const KEYS = {
  hotelConfidenceMin: 'CLASSIFIER_HOTEL_CONFIDENCE_MIN',
  dualBandMin: 'CLASSIFIER_DUAL_BAND_MIN',
  guestCountMax: 'CLASSIFIER_GUEST_COUNT_MAX',
  maxDurationNights: 'CLASSIFIER_MAX_DURATION_NIGHTS',
  hotelBudgetMax: 'CLASSIFIER_HOTEL_BUDGET_MAX',
  escalationCelebrationKinds: 'CLASSIFIER_ESCALATION_CELEBRATION_KINDS',
  escalationOccasionTypes: 'CLASSIFIER_ESCALATION_OCCASION_TYPES',
} as const;

function readNumber(src: ConfigSource, key: string): number | undefined {
  const raw = src[key];
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function readJsonStringArray(src: ConfigSource, key: string): string[] {
  const raw = src[key];
  if (raw === undefined || raw.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function loadClassifierConfig(source?: ConfigSource): ClassifierConfig {
  const src: ConfigSource = source ?? process.env;
  return {
    hotel_confidence_min: readNumber(src, KEYS.hotelConfidenceMin),
    dual_band_min: readNumber(src, KEYS.dualBandMin),
    guest_count_max: readNumber(src, KEYS.guestCountMax),
    max_duration_nights: readNumber(src, KEYS.maxDurationNights),
    hotel_budget_max: readNumber(src, KEYS.hotelBudgetMax),
    escalation_celebration_kinds: readJsonStringArray(src, KEYS.escalationCelebrationKinds),
    escalation_occasion_types: readJsonStringArray(src, KEYS.escalationOccasionTypes),
  };
}

export const CLASSIFIER_CONFIG_KEYS = KEYS;
