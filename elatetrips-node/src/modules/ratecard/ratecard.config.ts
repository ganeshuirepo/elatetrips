/**
 * M17 configuration (BR-17). Every business value — the tolerance slab table,
 * the above-slab default percentage, the cumulative-drift window and the
 * freshness threshold — is read HERE from env, never hard-coded. Defaults are
 * EMPTY / undefined: the engine ships INERT. With no slabs configured every
 * change stages for review; with no drift window the drift guard is a no-op;
 * with no freshness threshold nothing is ever marked stale. An operator supplies
 * real policy as data (env-seeded, per-destination overridable) later.
 *
 * There is intentionally NOT a single business literal in this file — not the
 * "14 days" of the delta's indicative default, not a slab percentage.
 */
import type { ToleranceSlab } from './ratecard.types';

export type ConfigSource = Record<string, string | undefined>;

export interface RatecardConfig {
  /** `pricing.tolerance_slabs` — ordered price slabs with descending percentages. */
  tolerance_slabs: ToleranceSlab[];
  /** Percentage applied above the last slab; falls back to the last slab's pct. */
  default_pct?: number;
  /** Per-destination slab overrides, keyed by destination id. */
  slabs_by_destination: Record<string, ToleranceSlab[]>;
  /** Rolling window (days) for the cumulative-drift guard; undefined ⇒ inert. */
  drift_window_days?: number;
  /** Freshness threshold (days) beyond which a partner is stale; undefined ⇒ inert. */
  freshness_threshold_days?: number;
}

const KEYS = {
  toleranceSlabs: 'CONFIG_TOLERANCE_SLABS',
  toleranceDefaultPct: 'CONFIG_TOLERANCE_DEFAULT_PCT',
  slabsByDestination: 'CONFIG_TOLERANCE_SLABS_BY_DEST',
  driftWindowDays: 'CONFIG_DRIFT_WINDOW_DAYS',
  freshnessThresholdDays: 'CONFIG_FRESHNESS_THRESHOLD_DAYS',
} as const;

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

function readJsonObject<T>(src: ConfigSource, key: string): Record<string, T> {
  const raw = src[key];
  if (raw === undefined || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, T>)
      : {};
  } catch {
    return {};
  }
}

export function loadRatecardConfig(source?: ConfigSource): RatecardConfig {
  const src: ConfigSource = source ?? process.env;
  return {
    tolerance_slabs: readJsonArray<ToleranceSlab>(src, KEYS.toleranceSlabs),
    default_pct: readInt(src, KEYS.toleranceDefaultPct),
    slabs_by_destination: readJsonObject<ToleranceSlab[]>(src, KEYS.slabsByDestination),
    drift_window_days: readInt(src, KEYS.driftWindowDays),
    freshness_threshold_days: readInt(src, KEYS.freshnessThresholdDays),
  };
}

export const RATECARD_CONFIG_KEYS = KEYS;
