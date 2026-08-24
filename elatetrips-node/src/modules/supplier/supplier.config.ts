/**
 * Supplier policy configuration (BR-17). Every business value M3 needs — the cap
 * sizes (5 primary / bench / reserve), the platform TAT floor (2h), the required
 * vetting artifacts, and the scorecard→quality-tier thresholds — is read HERE
 * from the config source (env by default), NEVER hard-coded in the engine.
 *
 * Defaults are intentionally EMPTY: the module ships inert (no cap enforced, no
 * TAT floor) and an operator supplies real policy as data. There is deliberately
 * not a single business literal (a 5, a 2, a threshold) baked into this file.
 * Mirrors the house pattern in `modules/contracts/contract.config.ts`.
 */

export type ConfigSource = Record<string, string | undefined>;

/** Per-destination cap row (FR3.3): primary slots + bench + reserve sizes. */
export interface SupplierCapRow {
  destination: string;
  primary: number;
  bench: number;
  reserve: number;
}

/** Scorecard→quality-tier movement thresholds (FR3.4, from M10). */
export interface TierThresholds {
  /** rank ≤ this ⇒ Preferred (lower rank is better). */
  preferred_max_rank?: number;
  /** rank ≥ this ⇒ Probation. */
  probation_min_rank?: number;
}

export interface SupplierConfig {
  /** Platform TAT floor in hours (FR3.9 = 2). Undefined ⇒ floor not enforced. */
  tat_floor_hours?: number;
  /** Fallback cap applied to any destination not named in `cap_policy`. */
  default_cap?: { primary: number; bench: number; reserve: number };
  /** Per-destination cap overrides (config/cap-policy.yaml, surfaced as JSON). */
  cap_policy: SupplierCapRow[];
  /** Vetting artifacts required before activation, per track (FR3.5). */
  required_vetting: { A: string[]; B: string[] };
  /** Quality-tier movement thresholds (FR3.4). */
  tier_thresholds: TierThresholds;
}

const KEYS = {
  tatFloorHours: 'SUPPLIER_TAT_FLOOR_HOURS',
  defaultCap: 'SUPPLIER_DEFAULT_CAP',
  capPolicy: 'SUPPLIER_CAP_POLICY',
  requiredVetting: 'SUPPLIER_REQUIRED_VETTING',
  tierThresholds: 'SUPPLIER_TIER_THRESHOLDS',
} as const;

function readInt(src: ConfigSource, key: string): number | undefined {
  const raw = src[key];
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = parseInt(raw, 10);
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

function readJsonArray<T>(src: ConfigSource, key: string): T[] {
  const parsed = readJson<unknown>(src, key, []);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

export function loadSupplierConfig(source?: ConfigSource): SupplierConfig {
  const src: ConfigSource = source ?? process.env;
  return {
    tat_floor_hours: readInt(src, KEYS.tatFloorHours),
    default_cap: readJson<SupplierConfig['default_cap']>(src, KEYS.defaultCap, undefined),
    cap_policy: readJsonArray<SupplierCapRow>(src, KEYS.capPolicy),
    required_vetting: readJson<{ A: string[]; B: string[] }>(src, KEYS.requiredVetting, {
      A: [],
      B: [],
    }),
    tier_thresholds: readJson<TierThresholds>(src, KEYS.tierThresholds, {}),
  };
}

/** Resolve the cap row for a destination, falling back to `default_cap`. */
export function capForDestination(
  config: SupplierConfig,
  destination: string,
): { primary: number; bench: number; reserve: number } | undefined {
  const row = config.cap_policy.find((r) => r.destination === destination);
  if (row) return { primary: row.primary, bench: row.bench, reserve: row.reserve };
  return config.default_cap;
}

export const SUPPLIER_CONFIG_KEYS = KEYS;
