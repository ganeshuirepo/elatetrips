/**
 * M4 communication config (BR-17). Every business value the comms service uses —
 * the ladder cadence, channel order, token TTL, quiet-hours window, voice caps,
 * enabled channels — is read HERE from env, never hard-coded. Defaults ship
 * INERT (empty ladder, no channels enabled, zero-length token life is refused at
 * mint): the technical half is built now; policy arrives as data later.
 *
 * There is intentionally not one business literal in this file — only env key
 * names and safe parse fallbacks.
 */
import type { Channel, LadderRung, QuietHours } from './comms.types';

export type ConfigSource = Record<string, string | undefined>;

export interface CommsConfig {
  /** HMAC secret for magic-link signing. Empty ⇒ mint/verify refuse (fail closed). */
  token_secret: string;
  /** Magic-link lifetime in minutes; undefined/0 ⇒ mint refuses. */
  token_ttl_minutes?: number;
  /** Channels the service is allowed to transmit on. Empty ⇒ every send is a no-op. */
  enabled_channels: Channel[];
  /** Canonical escalation order (BR-12); the ladder rungs must respect it. */
  channel_order: Channel[];
  /** Ordered ladder rungs {channel, after_*}. Empty ⇒ ladder never fires. */
  ladder: LadderRung[];
  /** Quiet-hours window for the voice rung (FR4.7). Undefined ⇒ no suppression. */
  quiet_hours?: QuietHours;
  /** Global voice caps (FR4.7); a rung may still narrow them. */
  voice_max_attempts?: number;
  voice_spacing_minutes?: number;
}

const KEYS = {
  tokenSecret: 'COMM_TOKEN_SECRET',
  tokenTtlMinutes: 'COMM_TOKEN_TTL_MINUTES',
  enabledChannels: 'COMM_ENABLED_CHANNELS',
  channelOrder: 'COMM_CHANNEL_ORDER',
  ladder: 'COMM_LADDER',
  quietHours: 'COMM_QUIET_HOURS',
  voiceMaxAttempts: 'COMM_VOICE_MAX_ATTEMPTS',
  voiceSpacingMinutes: 'COMM_VOICE_SPACING_MINUTES',
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

export function loadCommsConfig(source?: ConfigSource): CommsConfig {
  const src: ConfigSource = source ?? process.env;
  const quiet = readJson<QuietHours | undefined>(src, KEYS.quietHours, undefined);
  return {
    token_secret: (src[KEYS.tokenSecret] ?? '').trim(),
    token_ttl_minutes: readInt(src, KEYS.tokenTtlMinutes),
    enabled_channels: readJsonArray<Channel>(src, KEYS.enabledChannels),
    channel_order: readJsonArray<Channel>(src, KEYS.channelOrder),
    ladder: readJsonArray<LadderRung>(src, KEYS.ladder),
    quiet_hours: quiet && typeof quiet.start_hour === 'number' ? quiet : undefined,
    voice_max_attempts: readInt(src, KEYS.voiceMaxAttempts),
    voice_spacing_minutes: readInt(src, KEYS.voiceSpacingMinutes),
  };
}

export const COMMS_CONFIG_KEYS = KEYS;
