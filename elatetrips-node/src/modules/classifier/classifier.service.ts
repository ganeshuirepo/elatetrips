/**
 * ClassifierService (M12) — orchestrates the PURE rule engine with the side
 * effects a request needs: it classifies, persists the latest decision per RFQ,
 * emits the routing audit event (BR-6), and exposes the result so M5 broadcast
 * can consume it by INTERFACE, not by importing this module's internals.
 *
 * All economic/business judgement lives in `classifier.rules` and is driven by
 * `ClassifierConfig` (BR-17). This service adds no thresholds of its own.
 */
import { BadRequestError, NotFoundError } from '../../common/errors/AppError';
import { ClassifierAuditStore, type AuditEvent } from './classifier.audit';
import { loadClassifierConfig, type ClassifierConfig } from './classifier.config';
import { classifyRoute, RULE_IDS } from './classifier.rules';
import type {
  ClassificationDecision,
  ClassifierItinerary,
  ClassifierRfq,
  FulfilmentRoute,
} from './classifier.types';

const OPS_OVERRIDE_RULE_ID = 'RULE-OPS-OVERRIDE';

const VALID_ROUTES: readonly FulfilmentRoute[] = [
  'package_pinned',
  'celebration_manager',
  'hotel',
  'dmc',
  'dual',
];

const ROUTE_TRACK: Record<FulfilmentRoute, 'A' | 'B' | 'both' | undefined> = {
  package_pinned: undefined,
  celebration_manager: undefined,
  hotel: 'B',
  dmc: 'A',
  dual: 'both',
};

/** Injected clock keeps the service testable and the rule engine clock-free. */
export type Clock = () => string;

/**
 * The read interface M5 (broadcast) depends on — it never touches the concrete
 * class, only this contract (keeps M12 free of any runtime dependency on M5).
 */
export interface RouteDecisionReader {
  getDecision(rfqId: string): ClassificationDecision | undefined;
}

export class ClassifierService implements RouteDecisionReader {
  private readonly config: ClassifierConfig;
  private readonly clock: Clock;
  private readonly audit: ClassifierAuditStore;
  /** Latest decision per rfq_id (in-memory; additive, fixture-driven like M0 host). */
  private readonly decisions = new Map<string, ClassificationDecision>();

  constructor(opts?: { config?: ClassifierConfig; clock?: Clock; audit?: ClassifierAuditStore }) {
    this.config = opts?.config ?? loadClassifierConfig();
    this.clock = opts?.clock ?? ((): string => new Date().toISOString());
    this.audit = opts?.audit ?? new ClassifierAuditStore();
  }

  /** FR12.1–FR12.3 — classify an RFQ + itinerary into a fulfilment route. */
  classify(rfq: ClassifierRfq, itinerary: ClassifierItinerary): ClassificationDecision {
    const decision = classifyRoute(rfq, itinerary, this.config, this.clock());
    this.decisions.set(decision.rfq_id, decision);
    this.audit.emitDecision(decision, 'system', 'classifier');
    return decision;
  }

  /**
   * FR12.4 — ops overrides the route pre-broadcast. Recorded with the actor; the
   * prior decision's signals are preserved for explainability. Customer-visible
   * framing never exposes routing (handled by presentation layers, not here).
   */
  override(input: { rfq_id: string; route: FulfilmentRoute; actor: string; reason?: string }): ClassificationDecision {
    if (!VALID_ROUTES.includes(input.route)) {
      throw new BadRequestError(`Unknown route: ${input.route}`);
    }
    const prior = this.decisions.get(input.rfq_id);
    if (!prior) throw new NotFoundError(`No prior classification for rfq ${input.rfq_id}`);

    const decision: ClassificationDecision = {
      ...prior,
      route: input.route,
      track: ROUTE_TRACK[input.route],
      confidence: 1,
      rule_id: OPS_OVERRIDE_RULE_ID,
      reason: input.reason ?? `Ops override → ${input.route}.`,
      triggering_signals: ['ops_override'],
      kind: 'overridden',
      actor: input.actor,
      decided_at: this.clock(),
    };
    this.decisions.set(decision.rfq_id, decision);
    this.audit.emitDecision(decision, 'ops', input.actor);
    return decision;
  }

  /**
   * FR12.5 — post-classification scope creep re-classifies against itinerary v2.
   * pre_booking → the new route re-broadcasts (e.g. to DMC as v2); post_booking →
   * signals the ops-assisted add-on flow. This service returns the re-classified
   * decision; downstream never leaves the booking stuck.
   */
  upgrade(
    rfq: ClassifierRfq,
    itinerary: ClassifierItinerary,
    phase: 'pre_booking' | 'post_booking',
  ): ClassificationDecision {
    const base = classifyRoute(rfq, itinerary, this.config, this.clock());
    const decision: ClassificationDecision = { ...base, kind: 'upgraded', phase };
    this.decisions.set(decision.rfq_id, decision);
    this.audit.emitDecision(decision, 'system', 'classifier');
    return decision;
  }

  /** M5 consumes this — the current route decision for an RFQ, or undefined. */
  getDecision(rfqId: string): ClassificationDecision | undefined {
    return this.decisions.get(rfqId);
  }

  /** Full audit trail for an RFQ (explainability, FR12.4). */
  auditForRfq(rfqId: string): AuditEvent[] {
    return this.audit.bySubjectRfq(rfqId);
  }

  /** Exposed for tests / diagnostics — the rule ids this engine can emit. */
  static get ruleIds(): typeof RULE_IDS & { opsOverride: string } {
    return { ...RULE_IDS, opsOverride: OPS_OVERRIDE_RULE_ID };
  }
}
