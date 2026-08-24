/**
 * M5 configuration (BR-17). EVERY business value the broadcast + wave + bench
 * engines consume — wave sizes, TAT floor, graded-ladder cadence, fairness
 * floor, coverage floor, escalation timing, peak windows, load thresholds,
 * loss-reason vocabulary — is read HERE from env, never hard-coded. Defaults are
 * EMPTY/undefined: the engine ships inert and an operator supplies real policy
 * as data (per destination and track). There is intentionally NOT a single
 * business literal in this file.
 */

export type ConfigSource = Record<string, string | undefined>;

/** A recurring (MM-DD) or absolute (YYYY-MM-DD) calendar window. */
export interface PeakWindow {
  from: string;
  to: string;
  label?: string;
}

/**
 * One ladder rung (FR5.2b). Timing is expressed relative to declared TAT (D):
 * `at_factor` (× D, e.g. 0.5) and/or `after_hours` (added offset, e.g. +0.5 for
 * D+30m). `repeat` drives the up-to-N spaced voice calls.
 */
export interface LadderRungConfig {
  channel: string;
  at_factor?: number;
  after_hours?: number;
  repeat?: { count: number; spacing_hours: number };
}

export interface LoadThresholds {
  rfq_volume?: number;
  median_response_degraded_hours?: number;
  coverage_floor?: number;
  consecutive_rfqs?: number;
}

export interface FairnessConfig {
  /** Minimum share of a destination's RFQs each active partner must receive. */
  min_share?: number;
  /** fairness_debt value at/above which inclusion is forced (floor breached). */
  debt_floor?: number;
}

export interface BroadcastConfig {
  /** Wave-1 size by route: { A: dmcCount, B: hotelCount } (FR5.1). */
  wave_sizes: Partial<Record<'A' | 'B', number>>;
  /** Platform TAT floor in hours (A10); a declared TAT below it is clamped up. */
  tat_floor_hours?: number;
  /** Graded reminder ladder relative to declared TAT (BR-12). */
  ladder: LadderRungConfig[];
  fairness: FairnessConfig;
  /** Coverage below which a bench top-up wave fires (FR5.2b). */
  coverage_floor?: number;
  /** Hours after dispatch at which unmet RFQs escalate to ops (FR5.2b, T+8h). */
  escalation_hours?: number;
  /** Calendar peak windows that auto-activate bench (FR5.2a). */
  peak_windows: PeakWindow[];
  /** Load-signal thresholds that auto-activate bench (FR5.2a). */
  load_thresholds: LoadThresholds;
  /** Win/loss feedback vocabulary sent in close notices (FR5.5). */
  loss_reasons: string[];
}

const KEYS = {
  waveSizes: 'BROADCAST_WAVE_SIZES',
  tatFloorHours: 'BROADCAST_TAT_FLOOR_HOURS',
  ladder: 'BROADCAST_LADDER',
  fairness: 'BROADCAST_FAIRNESS',
  coverageFloor: 'BROADCAST_COVERAGE_FLOOR',
  escalationHours: 'BROADCAST_ESCALATION_HOURS',
  peakWindows: 'BROADCAST_PEAK_WINDOWS',
  loadThresholds: 'BROADCAST_LOAD_THRESHOLDS',
  lossReasons: 'BROADCAST_LOSS_REASONS',
} as const;

function readNumber(src: ConfigSource, key: string): number | undefined {
  const raw = src[key];
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function readJson<T>(src: ConfigSource, key: string, fallback: T): T {
  const raw = src[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadBroadcastConfig(source?: ConfigSource): BroadcastConfig {
  const src: ConfigSource = source ?? process.env;
  return {
    wave_sizes: readJson<Partial<Record<'A' | 'B', number>>>(src, KEYS.waveSizes, {}),
    tat_floor_hours: readNumber(src, KEYS.tatFloorHours),
    ladder: readJson<LadderRungConfig[]>(src, KEYS.ladder, []),
    fairness: readJson<FairnessConfig>(src, KEYS.fairness, {}),
    coverage_floor: readNumber(src, KEYS.coverageFloor),
    escalation_hours: readNumber(src, KEYS.escalationHours),
    peak_windows: readJson<PeakWindow[]>(src, KEYS.peakWindows, []),
    load_thresholds: readJson<LoadThresholds>(src, KEYS.loadThresholds, {}),
    loss_reasons: readJson<string[]>(src, KEYS.lossReasons, []),
  };
}

export const BROADCAST_CONFIG_KEYS = KEYS;
