/**
 * Platform configuration service (BR-17). Every business value — top_n,
 * shortlist cap, SLA matrix, gate window, ladder cadence, cap policy, TAT floor —
 * is read HERE from env, never hard-coded. Defaults are EMPTY: the engine ships
 * inert and an operator supplies real policy as data later. There is
 * intentionally NOT a single business literal in this file.
 */

export type ConfigSource = Record<string, string | undefined>;

export interface SlaRow {
  track: string;
  tier: string;
  hours: number;
}

export interface LadderRung {
  channel: string;
  after_hours: number;
}

export interface CapRow {
  destination: string;
  primary: number;
  bench: number;
  reserve: number;
}

export interface PlatformConfig {
  top_n?: number;
  shortlist_cap?: number;
  gate_tminus_days?: number;
  tat_floor_hours?: number;
  max_negotiation_rounds?: number;
  sla_matrix: SlaRow[];
  ladder: LadderRung[];
  cap_policy: CapRow[];
}

const KEYS = {
  topN: 'CONFIG_TOP_N',
  shortlistCap: 'CONFIG_SHORTLIST_CAP',
  gateTminusDays: 'CONFIG_GATE_TMINUS_DAYS',
  tatFloorHours: 'CONFIG_TAT_FLOOR_HOURS',
  maxNegotiationRounds: 'CONFIG_MAX_NEGOTIATION_ROUNDS',
  slaMatrix: 'CONFIG_SLA_MATRIX',
  ladder: 'CONFIG_LADDER',
  capPolicy: 'CONFIG_CAP_POLICY',
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

export function loadPlatformConfig(source?: ConfigSource): PlatformConfig {
  const src: ConfigSource = source ?? process.env;
  return {
    top_n: readInt(src, KEYS.topN),
    shortlist_cap: readInt(src, KEYS.shortlistCap),
    gate_tminus_days: readInt(src, KEYS.gateTminusDays),
    tat_floor_hours: readInt(src, KEYS.tatFloorHours),
    max_negotiation_rounds: readInt(src, KEYS.maxNegotiationRounds),
    sla_matrix: readJsonArray<SlaRow>(src, KEYS.slaMatrix),
    ladder: readJsonArray<LadderRung>(src, KEYS.ladder),
    cap_policy: readJsonArray<CapRow>(src, KEYS.capPolicy),
  };
}

export const CONFIG_KEYS = KEYS;
