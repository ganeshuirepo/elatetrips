/**
 * Freshness scoring (FR17.2) — pure functions. A partner's freshness score is
 * the number of days since its last fresh (applied) rate row. Staleness (score
 * beyond the configured threshold) is what M19 reads to suspend pool membership
 * and M20 to drop auto-confirm eligibility.
 *
 * The threshold is configuration (BR-17): with none set, scoring still reports a
 * score but nothing is ever marked stale (inert).
 */
import type { FreshnessResult } from './ratecard.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole-and-fractional days between an ISO timestamp and `now` (never negative). */
export function daysSince(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  return Math.max(0, (now.getTime() - then) / MS_PER_DAY);
}

/**
 * Build the freshness result for a partner from its last fresh row timestamp.
 *
 * @param lastFreshTs ISO timestamp of the most recent applied row, or null
 * @param thresholdDays config; undefined ⇒ staleness scoring is inert
 */
export function freshness(
  partner_id: string,
  lastFreshTs: string | null,
  thresholdDays: number | undefined,
  now: Date,
): FreshnessResult {
  const score = lastFreshTs === null ? null : daysSince(lastFreshTs, now);
  const threshold = thresholdDays ?? null;

  // Inert when unconfigured, or unknown when the partner has no rows at all.
  if (threshold === null || score === null) {
    return {
      partner_id,
      score_days: score,
      last_fresh_ts: lastFreshTs,
      threshold_days: threshold,
      fresh: false,
      stale: false,
    };
  }

  const stale = score > threshold;
  return {
    partner_id,
    score_days: score,
    last_fresh_ts: lastFreshTs,
    threshold_days: threshold,
    fresh: !stale,
    stale,
  };
}
