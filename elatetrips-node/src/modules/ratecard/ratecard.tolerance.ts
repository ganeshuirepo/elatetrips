/**
 * Price-tolerance evaluation — the RULE-BAND core (delta-003, FR17.3). Every
 * function here is PURE and side-effect-free so the rules can be reasoned about
 * and unit-tested in isolation.
 *
 * The single non-negotiable invariant: the band is ALWAYS computed on the
 * BASELINE — the previous applied rate — never on the incoming price. A jump
 * cannot be judged by its own destination slab, so a large increase can never
 * "buy" a wider band by landing in a higher slab.
 */
import type {
  DriftResult,
  RateDiff,
  RateRow,
  ToleranceBand,
  ToleranceOutcome,
  ToleranceSlab,
} from './ratecard.types';
import type { RatecardConfig } from './ratecard.config';

/** Slabs to use for a destination — a per-destination override, else the base table. */
export function resolveSlabs(config: RatecardConfig, destination: string): ToleranceSlab[] {
  const override = config.slabs_by_destination[destination];
  return override && override.length > 0 ? override : config.tolerance_slabs;
}

/** Slabs sorted ascending by `up_to` so evaluation is order-independent. */
function orderedSlabs(slabs: ToleranceSlab[]): ToleranceSlab[] {
  return [...slabs].sort((a, b) => a.up_to - b.up_to);
}

/**
 * The tolerance percentage for a baseline amount (minor units). The first slab
 * whose `up_to` covers the baseline wins; above the last slab, `default_pct` is
 * used when configured, otherwise the last slab's pct continues.
 *
 * Returns null when no slabs are configured — the engine is inert and every
 * change must stage (BR-17: ships with empty tables).
 */
export function resolveSlabPct(
  baselineMinor: number,
  slabs: ToleranceSlab[],
  defaultPct?: number,
): number | null {
  const ordered = orderedSlabs(slabs);
  if (ordered.length === 0) return null;
  for (const slab of ordered) {
    if (baselineMinor <= slab.up_to) return slab.pct;
  }
  return defaultPct ?? ordered[ordered.length - 1].pct;
}

/** The band [baseline − pct%, baseline + pct%] computed on the baseline. */
export function toleranceBand(
  baselineMinor: number,
  slabs: ToleranceSlab[],
  defaultPct?: number,
): ToleranceBand | null {
  const pct = resolveSlabPct(baselineMinor, slabs, defaultPct);
  if (pct === null) return null;
  const delta = Math.round((baselineMinor * pct) / 100);
  return {
    baseline_minor: baselineMinor,
    slab_pct: pct,
    lower_minor: baselineMinor - delta,
    upper_minor: baselineMinor + delta,
  };
}

function pctChange(baselineMinor: number, incomingMinor: number): number | null {
  if (baselineMinor === 0) return null;
  return ((incomingMinor - baselineMinor) / baselineMinor) * 100;
}

/**
 * Single-step tolerance decision. A first-ever price for a SKU (no baseline)
 * has nothing to be judged against, so it auto-applies and establishes the
 * baseline. Otherwise the band is computed on the baseline and the incoming
 * price is tested against it.
 */
export function evaluateTolerance(
  baselineMinor: number | null,
  incomingMinor: number,
  slabs: ToleranceSlab[],
  defaultPct?: number,
): ToleranceOutcome {
  if (baselineMinor === null) {
    return { decision: 'auto_apply', within_band: true, band: null, delta_pct: null };
  }
  const band = toleranceBand(baselineMinor, slabs, defaultPct);
  const delta_pct = pctChange(baselineMinor, incomingMinor);
  // No slabs configured (band === null) ⇒ inert engine ⇒ stage for review.
  if (band === null) {
    return { decision: 'stage', within_band: false, band: null, delta_pct, reason: 'beyond_band' };
  }
  const within = incomingMinor >= band.lower_minor && incomingMinor <= band.upper_minor;
  return within
    ? { decision: 'auto_apply', within_band: true, band, delta_pct }
    : { decision: 'stage', within_band: false, band, delta_pct, reason: 'beyond_band' };
}

export interface DriftHistoryPoint {
  price_minor: number;
  ts: string;
}

/**
 * Cumulative-drift guard (anti-salami-slicing). Within-band steps that
 * individually pass can still add up to a move beyond the band over a rolling
 * window; this catches that. The window anchor is the earliest applied price
 * inside the window (or, if none, the standing price just before it), the band
 * is computed on THAT anchor, and the incoming price is tested against it.
 *
 * Inert when no window is configured (BR-17) — returns not-breached.
 *
 * @param history applied prices for the SKU, in chronological order (oldest first)
 * @param windowStart now − drift_window_days (caller derives from config + clock)
 */
export function cumulativeDriftGuard(
  history: DriftHistoryPoint[],
  incomingMinor: number,
  windowStart: Date | null,
  slabs: ToleranceSlab[],
  defaultPct?: number,
): DriftResult {
  if (windowStart === null) return { breached: false };

  const chronological = [...history].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  );
  const startMs = windowStart.getTime();
  const inWindow = chronological.filter((h) => new Date(h.ts).getTime() >= startMs);

  // Anchor: first price inside the window, else the last price before it (the
  // standing baseline as the window opened).
  const before = chronological.filter((h) => new Date(h.ts).getTime() < startMs);
  const anchor = inWindow[0] ?? before[before.length - 1];
  if (!anchor) return { breached: false };

  const band = toleranceBand(anchor.price_minor, slabs, defaultPct);
  if (band === null) return { breached: false };

  const breached = incomingMinor < band.lower_minor || incomingMinor > band.upper_minor;
  const result: DriftResult = {
    breached,
    anchor_minor: anchor.price_minor,
    band,
  };
  const aggregate = pctChange(anchor.price_minor, incomingMinor);
  if (aggregate !== null) result.aggregate_delta_pct = aggregate;
  return result;
}

/** The diff kind an incoming price represents against the current baseline. */
export function stageDiff(baseline: RateRow | undefined, incomingMinor: number, meta: {
  partner_id: string;
  destination: string;
  sku: string;
}): RateDiff {
  if (!baseline) {
    return { ...meta, kind: 'new', baseline_minor: null, incoming_minor: incomingMinor };
  }
  return {
    ...meta,
    kind: baseline.price.amount === incomingMinor ? 'unchanged' : 'change',
    baseline_minor: baseline.price.amount,
    incoming_minor: incomingMinor,
  };
}
