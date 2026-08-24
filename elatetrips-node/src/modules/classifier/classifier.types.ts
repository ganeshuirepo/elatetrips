/**
 * M12 — Fulfilment Route Classifier: type surface.
 *
 * The classifier is a PURE, DETERMINISTIC decision function over an RFQ + its
 * itinerary v1 (BR-16 — RULES ONLY, no model). Its output is a typed routing
 * decision that M5 (broadcast) acts on. M12 has no runtime dependency on M5;
 * M5 reads this decision through the ClassifierService interface (contract, not
 * direct coupling).
 *
 * The RFQ / Itinerary shapes below are the SUBSET of the frozen contracts
 * (`/contracts/rfq.schema.json`, `/contracts/itinerary.schema.json`) that the
 * rules actually read. They are consumed BY CONTRACT SHAPE ONLY — this module
 * never imports another module's source (read-scope rule). Callers may pass the
 * full contract objects; the extra fields are ignored.
 */

/** Track A = DMC pool; Track B = direct hotels (see M12 spec / api.md). */
export type Track = 'A' | 'B' | 'both';

/**
 * The fulfilment route a decision resolves to.
 * - `package_pinned`      — RFQ carries a package_id → pinned path, no open classification.
 * - `celebration_manager` — wedding / escalation occasion → routed to the celebration/wedding manager.
 * - `hotel`               — Track B, direct hotel (requires HIGH confidence, FR12.2).
 * - `dmc`                 — Track A, DMC broadcast (the safe default, FR12.2).
 * - `dual`                — both tracks; M7 scoring compares across them (FR12.3).
 */
export type FulfilmentRoute =
  | 'package_pinned'
  | 'celebration_manager'
  | 'hotel'
  | 'dmc'
  | 'dual';

/** How the decision was produced (FR12.4 override records the actor). */
export type DecisionKind = 'classified' | 'overridden' | 'upgraded';

/** Contract subset of an RFQ that the rules read (see rfq.schema.json). */
export interface ClassifierRfq {
  rfq_id: string;
  version?: number;
  package_id?: string;
  occasion: {
    type: 'celebration' | 'surprise' | 'event' | 'adventure' | 'leisure';
    details?: {
      celebrations?: { kind: string; age?: number; decor?: boolean; cake?: boolean }[];
      privacy?: boolean;
    };
  };
  destination: { mode: 'place' | 'suggest_for_me'; place?: string; region_pref?: string };
  dates?: { start?: string; end?: string; flex_days?: number };
  travellers: { adults: number; kids: { age: number }[] };
  hotel: { budget_per_night: { amount: number; currency: string }; category?: number };
  inclusions: string[];
}

/** Contract subset of an itinerary that the rules read (see itinerary.schema.json). */
export interface ClassifierItinerary {
  itinerary_id: string;
  version?: number;
  rfq_id?: string;
  package_id?: string;
  days: {
    day_index: number;
    items: {
      item_id: string;
      type: 'hotel' | 'activity' | 'transfer' | 'meal' | 'experience';
      title: string;
      locked: boolean;
      source: 'ai' | 'master_db' | 'customer';
      route_pack_id?: string;
    }[];
  }[];
}

/**
 * The extracted feature vector — every raw signal the rules evaluate. Stored on
 * the decision so any route can be re-explained months later (FR12.4).
 */
export interface ClassificationSignals {
  has_package: boolean;
  wedding_escalation: boolean;
  external_activity_or_experience: boolean;
  transfer_present: boolean;
  multi_property: boolean;
  multi_city: boolean;
  kids_activity_requirement: boolean;
  guest_count: number;
  guest_count_over_threshold: boolean;
  duration_nights: number;
  off_property_surprise: boolean;
  within_budget_band: boolean;
  within_duration_band: boolean;
  destination_coverage_known: boolean;
  single_property: boolean;
  low_celebration_complexity: boolean;
  no_kids: boolean;
}

/**
 * The routing decision M5 consumes. `rule_id` (BR-16) makes every decision
 * auditable; `triggering_signals` + `signals` give explainability (FR12.4).
 */
export interface ClassificationDecision {
  rfq_id: string;
  itinerary_id?: string;
  itinerary_version?: number;
  route: FulfilmentRoute;
  track?: Track;
  /** 0..1 confidence in the CHOSEN route. Hotel needs >= configured minimum. */
  confidence: number;
  rule_id: string;
  reason: string;
  triggering_signals: string[];
  signals: ClassificationSignals;
  kind: DecisionKind;
  /** Present on overrides (FR12.4) and upgrades (FR12.5). */
  actor?: string;
  /** Upgrade re-classification context (FR12.5). */
  phase?: 'pre_booking' | 'post_booking';
  decided_at: string;
}
