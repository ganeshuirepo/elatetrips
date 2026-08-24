/**
 * M3 business rules as PURE functions — no I/O, no DB, no clock. Kept apart from
 * the service so the cap policy (FR3.3), the TAT floor (FR3.9), quality tiering
 * (FR3.4), the vetting gate (FR3.5) and the re-acceptance gate (FR3.10) can be
 * unit-tested directly. Every threshold they use is PASSED IN from config
 * (BR-17); not one business literal lives here.
 */
import type {
  CapDecision,
  QualityTier,
  ScorecardRef,
  Supplier,
  Track,
} from './supplier.types';
import type { SupplierConfig, TierThresholds } from './supplier.config';

/**
 * FR3.9 declared-TAT floor. `floorHours` comes from config; when it is undefined
 * the module ships inert (no floor enforced) per BR-17. Returns null when OK, or
 * a human-readable reason when the declared TAT is below the floor.
 */
export function checkTatFloor(
  declaredHours: number,
  floorHours: number | undefined,
): string | null {
  if (floorHours === undefined) return null;
  if (!Number.isFinite(declaredHours)) return 'declared_tat_hours must be a number';
  if (declaredHours < floorHours) {
    return `declared_tat_hours ${declaredHours} is below the platform floor of ${floorHours}h`;
  }
  return null;
}

/**
 * FR3.3 cap policy. Track B (direct hotels) and supporting providers are an
 * uncapped-but-vetted roster → reserve slot. Track A (DMCs) is capped: a primary
 * slot is granted while the active-primary count is below the destination cap,
 * otherwise the 6th+ primary is deflected to the bench with a prompt.
 *
 * `cap` (primary slots) and the current `primaryCount` are supplied by the
 * caller — the function itself holds no numbers.
 */
export function decideCapSlot(
  track: Track,
  primaryCount: number,
  cap: number | undefined,
): CapDecision {
  if (track === 'B') return { outcome: 'uncapped', slot: 'reserve' };
  // No cap configured ⇒ inert: admit as primary (operator has not set policy).
  if (cap === undefined) return { outcome: 'accept', slot: 'primary' };
  if (primaryCount < cap) return { outcome: 'accept', slot: 'primary' };
  return {
    outcome: 'bench',
    slot: 'bench',
    reason: `destination already has ${primaryCount}/${cap} primary DMCs; assign to reserve bench`,
    primary_count: primaryCount,
    cap,
  };
}

/**
 * FR3.5 vetting gate. Returns the list of MISSING required artifacts for the
 * track (empty ⇒ complete). The required set is config-driven (BR-17); an empty
 * config list means nothing is required yet (inert).
 */
export function missingVettingArtifacts(supplier: Supplier, config: SupplierConfig): string[] {
  const required = config.required_vetting[supplier.track] ?? [];
  const v = supplier.vetting ?? {};
  return required.filter((key) => {
    const value = (v as Record<string, unknown>)[key];
    if (typeof value === 'boolean') return value !== true;
    if (typeof value === 'number') return !(value > 0);
    return value === undefined || value === null || value === '';
  });
}

/** True when at least one contact is OTP-verified (FR3.11 / BR-15). */
export function hasOtpVerifiedContact(supplier: Supplier): boolean {
  return (supplier.contacts ?? []).some((c) => c.otp_verified === true);
}

/**
 * Reasons a supplier CANNOT be activated (empty ⇒ activation allowed). Combines
 * FR3.5 vetting, FR3.10 contract acceptance, FR3.11 OTP-verified contact and
 * FR3.9 declared TAT — exactly the AC gate list.
 */
export function activationBlockers(supplier: Supplier, config: SupplierConfig): string[] {
  const blockers: string[] = [];
  const missing = missingVettingArtifacts(supplier, config);
  if (missing.length) blockers.push(`missing vetting artifacts: ${missing.join(', ')}`);
  if (!supplier.contract_accepted || !supplier.contract_acceptance) {
    blockers.push('contract not accepted (FR3.10)');
  }
  if (!hasOtpVerifiedContact(supplier)) blockers.push('no OTP-verified contact (FR3.11)');
  const tatIssue = checkTatFloor(supplier.declared_tat_hours, config.tat_floor_hours);
  if (tatIssue) blockers.push(tatIssue);
  return blockers;
}

/**
 * FR3.4 quality tiering from the M10 scorecard rank. Thresholds are config-driven
 * (BR-17). With no scorecard rank yet (M10 not live), tiering is undefined —
 * fairness floor (M5 FR5.2) means tier NEVER affects inclusion, only ordering.
 */
export function resolveQualityTier(
  scorecard: ScorecardRef | undefined,
  thresholds: TierThresholds,
): QualityTier | undefined {
  const rank = scorecard?.rank;
  if (rank === undefined || rank === null) return undefined;
  if (thresholds.preferred_max_rank !== undefined && rank <= thresholds.preferred_max_rank) {
    return 'preferred';
  }
  if (thresholds.probation_min_rank !== undefined && rank >= thresholds.probation_min_rank) {
    return 'probation';
  }
  return 'standard';
}

/**
 * FR3.10 re-acceptance gate. A material version change forces re-acceptance
 * before the partner receives further RFQs. True ⇒ the supplier must re-accept
 * (their accepted version differs from, or predates, the current one).
 */
export function requiresReacceptance(
  supplier: Supplier,
  currentContractVersion: string | undefined,
): boolean {
  if (currentContractVersion === undefined) return false;
  const accepted = supplier.contract_acceptance?.version;
  if (!accepted) return true;
  return accepted !== currentContractVersion;
}

/**
 * Deterministic candidate ordering (FR3.8 AC: "deterministic ordered list").
 * Preferred before Standard before Probation; then by scorecard rank ascending
 * (unranked last); then highest fairness-debt first (owed a turn); then a stable
 * tie-break on supplier_id. Tier affects ORDER only, never inclusion (FR5.2).
 */
const TIER_WEIGHT: Record<QualityTier, number> = {
  preferred: 0,
  standard: 1,
  probation: 2,
};

export function compareCandidates(a: Supplier, b: Supplier): number {
  const tw = (s: Supplier) => (s.quality_tier ? TIER_WEIGHT[s.quality_tier] : 1);
  const rank = (s: Supplier) =>
    s.scorecard?.rank ?? Number.MAX_SAFE_INTEGER;
  const debt = (s: Supplier) => s.scorecard?.fairness_debt ?? 0;
  return (
    tw(a) - tw(b) ||
    rank(a) - rank(b) ||
    debt(b) - debt(a) ||
    a.supplier_id.localeCompare(b.supplier_id)
  );
}
