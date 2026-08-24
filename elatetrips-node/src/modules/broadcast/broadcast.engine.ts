/**
 * M5 wave + bench engine — PURE, deterministic, side-effect-free functions.
 * No I/O, no clock of its own (timestamps are passed in), no config literals
 * (thresholds arrive via `BroadcastConfig`, BR-17). This is what the AC's
 * simulated-clock test drives directly, and what the service composes with the
 * M3/M4 ports.
 */
import type { BroadcastConfig, PeakWindow } from './broadcast.config';
import type {
  BenchDecision,
  BenchSignals,
  BenchTrigger,
  CloseNotice,
  CloseOutcome,
  LadderRung,
  NextWaveDecision,
  NextWaveDecisionInput,
  SupplierCandidate,
  WaveSelectionInput,
  WaveSelectionResult,
} from './broadcast.types';

const TIER_RANK: Record<SupplierCandidate['tier'], number> = { primary: 0, bench: 1, reserve: 2 };

/**
 * Order candidates for inclusion: tier first, then scorecard (desc), then
 * supplier_id for a stable, deterministic tie-break. Ordering NEVER decides
 * inclusion — the fairness pass in `selectWaveRecipients` does (FR5.2).
 */
function byRank(a: SupplierCandidate, b: SupplierCandidate): number {
  const t = TIER_RANK[a.tier] - TIER_RANK[b.tier];
  if (t !== 0) return t;
  const s = (b.scorecard ?? 0) - (a.scorecard ?? 0);
  if (s !== 0) return s;
  return a.supplier_id.localeCompare(b.supplier_id);
}

/**
 * FR5.1 route-aware wave selection with the FR5.2 fairness floor.
 *
 * 1. Eligible = contract-accepted candidates not already contacted for this RFQ.
 * 2. Force-include anyone whose `fairness_debt` has breached the configured
 *    floor — regardless of tier — so ranks 3–5 never starve.
 * 3. Fill the remaining wave budget (route-derived size) by rank order.
 *
 * Never blasts all: the wave size caps the fan-out. Wave sizes and the fairness
 * floor come entirely from config.
 */
export function selectWaveRecipients(input: WaveSelectionInput, config: BroadcastConfig): WaveSelectionResult {
  const { candidates, route, alreadyContacted } = input;
  const contacted = new Set(alreadyContacted);
  const eligible = candidates.filter((c) => c.contract_accepted && !contacted.has(c.supplier_id));

  const waveSize = config.wave_sizes[route] ?? 0;
  const debtFloor = config.fairness.debt_floor;

  const forced: SupplierCandidate[] = [];
  const normal: SupplierCandidate[] = [];
  for (const c of eligible) {
    if (debtFloor !== undefined && debtFloor > 0 && (c.fairness_debt ?? 0) >= debtFloor) {
      forced.push(c);
    } else {
      normal.push(c);
    }
  }
  forced.sort(byRank);
  normal.sort(byRank);

  const selected: SupplierCandidate[] = [...forced];
  for (const c of normal) {
    if (selected.length >= waveSize) break;
    selected.push(c);
  }

  const selectedIds = new Set(selected.map((c) => c.supplier_id));
  return {
    supplier_ids: selected.map((c) => c.supplier_id),
    forced_inclusions: forced.map((c) => c.supplier_id),
    deferred: eligible.filter((c) => !selectedIds.has(c.supplier_id)).map((c) => c.supplier_id),
  };
}

/**
 * FR5.2b — graded TAT-derived ladder for one partner. D = declared TAT, floored
 * by config (A10). Each configured rung fires at `at_factor·D + after_hours`
 * from dispatch; a rung with `repeat` expands into N spaced attempts (the
 * up-to-3 voice calls). Returns absolute ISO fire times; quiet-hours and
 * engagement-cancellation are enforced by the caller/M4, not synthesised here.
 */
export function planLadder(
  declaredTatHours: number,
  dispatchTs: string,
  config: BroadcastConfig,
): LadderRung[] {
  const floor = config.tat_floor_hours ?? 0;
  const d = Math.max(declaredTatHours, floor);
  const base = new Date(dispatchTs).getTime();
  const rungs: LadderRung[] = [];
  for (const rung of config.ladder) {
    const offsetHours = (rung.at_factor ?? 0) * d + (rung.after_hours ?? 0);
    const first = base + offsetHours * 3_600_000;
    if (rung.repeat && rung.repeat.count > 0) {
      for (let i = 0; i < rung.repeat.count; i += 1) {
        rungs.push({
          channel: rung.channel,
          fire_ts: new Date(first + i * rung.repeat.spacing_hours * 3_600_000).toISOString(),
          attempt: i + 1,
        });
      }
    } else {
      rungs.push({ channel: rung.channel, fire_ts: new Date(first).toISOString() });
    }
  }
  return rungs.sort((a, b) => a.fire_ts.localeCompare(b.fire_ts));
}

/**
 * Decide what to do once the current wave's TAT window is observed. Coverage
 * below the configured floor triggers a bench top-up while bench remains
 * available; past the escalation window with the floor still unmet, escalate to
 * ops (FR5.2b). All thresholds from config.
 */
export function nextWaveDecision(input: NextWaveDecisionInput, config: BroadcastConfig): NextWaveDecision {
  const floor = config.coverage_floor;
  const covered = floor === undefined || input.coverage >= floor;
  if (covered) return { action: 'stop', reason: 'coverage_floor_met' };

  const escalate = config.escalation_hours !== undefined && input.elapsedHours >= config.escalation_hours;
  if (escalate) return { action: 'escalate', reason: 'escalation_window_reached' };

  if (input.tatLapsed && input.benchAvailable) return { action: 'top_up', reason: 'coverage_below_floor' };
  return { action: 'wait', reason: 'tat_window_open' };
}

// ---- Bench activation (FR5.2a) --------------------------------------------

/** True if `now` (UTC) falls inside a window, supporting MM-DD and YYYY-MM-DD. */
export function isWithinPeakWindow(now: Date, window: PeakWindow): boolean {
  const iso = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const md = iso.slice(5); // MM-DD
  const isRecurring = window.from.length === 5 && window.to.length === 5;
  if (isRecurring) {
    // MM-DD compare, handling year wrap (e.g. 12-20 → 01-05).
    if (window.from <= window.to) return md >= window.from && md <= window.to;
    return md >= window.from || md <= window.to;
  }
  return iso >= window.from && iso <= window.to;
}

/**
 * FR5.2a — pure bench-activation decision. Bench is activated when EITHER a
 * calendar peak window is active OR any load signal breaches its configured
 * threshold: RFQ volume above threshold, median primary response time
 * degrading, or quote coverage below the floor on the configured number of
 * consecutive RFQs. When no trigger holds, the desired state is reverted. The
 * `changed` / `action` fields tell the caller whether to write + notify.
 */
export function decideBenchActivation(
  signals: BenchSignals,
  now: Date,
  config: BroadcastConfig,
): BenchDecision {
  const triggers: BenchTrigger[] = [];

  if (config.peak_windows.some((w) => isWithinPeakWindow(now, w))) triggers.push('calendar_peak');

  const t = config.load_thresholds;
  if (t.rfq_volume !== undefined && signals.rfq_volume !== undefined && signals.rfq_volume > t.rfq_volume) {
    triggers.push('rfq_volume');
  }
  if (
    t.median_response_degraded_hours !== undefined &&
    signals.median_response_hours !== undefined &&
    signals.median_response_hours > t.median_response_degraded_hours
  ) {
    triggers.push('response_time');
  }
  if (t.coverage_floor !== undefined && t.consecutive_rfqs !== undefined && signals.recent_coverage) {
    const window = signals.recent_coverage.slice(-t.consecutive_rfqs);
    if (window.length >= t.consecutive_rfqs && window.every((c) => c < (t.coverage_floor as number))) {
      triggers.push('coverage');
    }
  }

  const activate = triggers.length > 0;
  const changed = activate !== signals.currently_activated;
  return {
    destination: signals.destination,
    track: signals.track,
    activate,
    changed,
    action: changed ? (activate ? 'activate' : 'revert') : 'noop',
    triggers,
  };
}

// ---- Stop conditions (FR5.5) ----------------------------------------------

/** Confirmed or cancelled ⇒ timers cancel and close notices go out (FR5.5). */
export function shouldStop(outcome: CloseOutcome | undefined): boolean {
  return outcome === 'confirmed' || outcome === 'cancelled';
}

/**
 * Build per-supplier close notices. The winner (if any) is marked won; every
 * other contacted supplier gets a loss reason drawn from the configured
 * vocabulary (FR5.5) — the caller passes the ops/AI-chosen reason per supplier,
 * validated here against the config so no free-text leaks out.
 */
export function buildCloseNotices(
  contacted: string[],
  winnerSupplierId: string | undefined,
  lossReasonBySupplier: Record<string, string>,
  config: BroadcastConfig,
): CloseNotice[] {
  const vocab = new Set(config.loss_reasons);
  return contacted.map((supplier_id) => {
    if (supplier_id === winnerSupplierId) return { supplier_id, won: true };
    const reason = lossReasonBySupplier[supplier_id];
    return {
      supplier_id,
      won: false,
      loss_reason: reason && vocab.has(reason) ? reason : undefined,
    };
  });
}
