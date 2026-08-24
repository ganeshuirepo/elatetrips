/**
 * M5 — RFQ Broadcast & Wave Engine: domain types.
 *
 * These mirror only the CONTRACT shapes M5 depends on (supplier.schema.json,
 * rfq.schema.json, events.md). M5 CONSUMES M3 (supplier directory) and M4
 * (comms/magic-link) through the thin ports declared in `broadcast.ports.ts` —
 * it never imports M3/M4 source, so the types here describe the wire shapes the
 * ports exchange, nothing more.
 *
 * Every business value (wave sizes, TAT cadence, peak windows, load thresholds,
 * fairness floor) lives in `broadcast.config.ts` (BR-17) — never here.
 */

export type Track = 'A' | 'B';
export type SupplierTier = 'primary' | 'bench' | 'reserve';
export type SupplierType = 'dmc' | 'hotel' | 'adventure' | 'experience' | 'transport';

/** Route decided upstream by M12: A = DMC route, B = direct-hotel route. */
export type Route = Track;

/**
 * A broadcast candidate as returned by the M3 directory port. A superset of the
 * frozen supplier contract with the fairness + ordering signals M3 applies
 * server-side (`fairness_debt`, `scorecard`) — these affect ORDERING and
 * tie-breaks only, never inclusion (FR5.2).
 */
export interface SupplierCandidate {
  supplier_id: string;
  type: SupplierType;
  destinations: string[];
  track: Track;
  tier: SupplierTier;
  declared_tat_hours: number;
  contract_accepted: boolean;
  comms_consent?: { sms?: boolean; email?: boolean; whatsapp?: boolean; voice?: boolean };
  /** M3 fairness ledger: times skipped since last inclusion (FR5.2 / FR5.6). */
  fairness_debt?: number;
  /** M3 scorecard 0..1 — ordering / enrichment eligibility / tie-break only. */
  scorecard?: number;
}

// ---- Wave engine (pure) ----------------------------------------------------

export interface WaveSelectionInput {
  candidates: SupplierCandidate[];
  route: Route;
  waveNo: number;
  /** supplier_ids already contacted in prior waves for this RFQ. */
  alreadyContacted: string[];
}

export interface WaveSelectionResult {
  supplier_ids: string[];
  /** Subset force-included because their fairness floor was breached (FR5.2). */
  forced_inclusions: string[];
  /** supplier_ids considered but not selected this wave (ordering surplus). */
  deferred: string[];
}

/** One rung of the TAT-derived graded ladder (FR5.2b, BR-12). */
export interface LadderRung {
  channel: string;
  /** Absolute fire time, ISO-8601, computed from dispatch + declared TAT. */
  fire_ts: string;
  /** Sequence for repeating rungs (e.g. the up-to-3 voice calls). */
  attempt?: number;
}

export type NextWaveAction = 'top_up' | 'escalate' | 'wait' | 'stop';

export interface NextWaveDecisionInput {
  waveNo: number;
  /** Distinct quotes received so far for this RFQ. */
  coverage: number;
  /** Hours elapsed since the current wave was dispatched. */
  elapsedHours: number;
  /** Whether the current wave's declared-TAT window has lapsed. */
  tatLapsed: boolean;
  /** Whether bench candidates remain available to top up from. */
  benchAvailable: boolean;
}

export interface NextWaveDecision {
  action: NextWaveAction;
  reason: string;
}

// ---- Bench activation (pure) ----------------------------------------------

/** Live load signals for a destination+track, supplied by monitoring / M7. */
export interface BenchSignals {
  destination: string;
  track: Track;
  /** RFQ volume in the recent evaluation window. */
  rfq_volume?: number;
  /** Observed median primary response time (hours). */
  median_response_hours?: number;
  /** Coverage (distinct quotes) on the most recent consecutive RFQs, newest last. */
  recent_coverage?: number[];
  /** Current bench state for this destination+track. */
  currently_activated: boolean;
}

export type BenchTrigger = 'calendar_peak' | 'rfq_volume' | 'response_time' | 'coverage';
export type BenchAction = 'activate' | 'revert' | 'noop';

export interface BenchDecision {
  destination: string;
  track: Track;
  /** Desired activation state after evaluating all triggers. */
  activate: boolean;
  /** True when the desired state differs from the current state. */
  changed: boolean;
  action: BenchAction;
  /** Which triggers fired (empty ⇒ no activation pressure). */
  triggers: BenchTrigger[];
}

// ---- Stop conditions (pure) -----------------------------------------------

export type CloseOutcome = 'confirmed' | 'cancelled';

export interface CloseNotice {
  supplier_id: string;
  won: boolean;
  /** Loss-reason code from the configured vocabulary (FR5.5); absent for winner. */
  loss_reason?: string;
}

// ---- Audit envelope (events.md) -------------------------------------------

/**
 * `wave.sent` is in the frozen catalog (events.md). `bench.activated` /
 * `bench.reverted` are NOT yet in the catalog — FR5.2a requires activation and
 * reversion to be audited, so they are emitted on this module's own stream and
 * flagged for a `contracts-deltas/delta-NNN.md` to formalise them (constitution
 * §2). No frozen contract is edited by this module.
 */
export type BroadcastEventType = 'wave.sent' | 'bench.activated' | 'bench.reverted';

export type Actor = 'customer' | 'ops' | 'supplier' | 'system' | 'ai';
export type Role = 'customer' | 'dmc' | 'hotel' | 'provider' | 'ops' | 'platform';

export interface BroadcastAuditEvent {
  event_id: string;
  type: BroadcastEventType;
  actor: Actor;
  actor_id: string;
  role: Role;
  ts: string;
  subject: { rfq_id?: string; destination?: string; track?: Track };
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  payload: Record<string, unknown>;
}

// ---- Service-level views ---------------------------------------------------

export interface WaveRecord {
  rfq_id: string;
  wave_no: number;
  supplier_ids: string[];
  forced_inclusions: string[];
  channel: string;
  dispatched_ts: string;
  ladder: LadderRung[];
}

export interface BroadcastState {
  rfq_id: string;
  route: Route;
  destination: string;
  track: Track;
  waves: WaveRecord[];
  contacted: string[];
  stopped: boolean;
  outcome?: CloseOutcome;
}
