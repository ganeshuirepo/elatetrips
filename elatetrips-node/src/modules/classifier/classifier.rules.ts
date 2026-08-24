/**
 * M12 rule engine — PURE + DETERMINISTIC (BR-16, RULES ONLY, no model).
 *
 * There is no randomness, no clock read, no I/O and no LLM here: the same
 * (rfq, itinerary, config) always yields the same decision. Every branch returns
 * an explicit `rule_id`, so any route can be re-explained from the audit trail
 * months later (FR12.4). Business values arrive from `ClassifierConfig` (BR-17);
 * with empty config only the structural forcing rules and the mandatory DMC
 * default can fire — the classifier is safely inert until an operator loads
 * policy.
 *
 * Asymmetric bias (FR12.2): misrouting to hotel is expensive, misrouting to DMC
 * only costs margin — so the hotel route requires HIGH confidence and anything
 * ambiguous falls to DMC (or dual). The rules are evaluated in priority order,
 * FIRST MATCH WINS, and RULE-DEFAULT-DMC guarantees deterministic behaviour when
 * nothing else matches.
 */
import type {
  ClassifierConfig,
} from './classifier.config';
import type {
  ClassificationDecision,
  ClassificationSignals,
  ClassifierItinerary,
  ClassifierRfq,
  FulfilmentRoute,
  Track,
} from './classifier.types';

/** Rule identifiers — stable, audited (BR-16). */
export const RULE_IDS = {
  packagePinned: 'RULE-PIN-01',
  weddingEscalation: 'RULE-ESC-01',
  dmcActivity: 'RULE-DMC-ACTIVITY',
  dmcTransfer: 'RULE-DMC-TRANSFER',
  dmcMultiProperty: 'RULE-DMC-MULTIPROP',
  dmcKidsActivity: 'RULE-DMC-KIDS',
  dmcGuestCount: 'RULE-DMC-GUESTS',
  dmcOffPropertySurprise: 'RULE-DMC-SURPRISE',
  hotelHighConfidence: 'RULE-HOTEL-01',
  dualMidBand: 'RULE-DUAL-01',
  defaultDmc: 'RULE-DEFAULT-DMC',
} as const;

const ROUTE_TRACK: Record<FulfilmentRoute, Track | undefined> = {
  package_pinned: undefined,
  celebration_manager: undefined,
  hotel: 'B',
  dmc: 'A',
  dual: 'both',
};

function flattenItems(itinerary: ClassifierItinerary): ClassifierItinerary['days'][number]['items'] {
  return itinerary.days.flatMap((d) => d.items ?? []);
}

/** Nights implied by the itinerary (day count minus the checkout day, min 1). */
function durationNights(itinerary: ClassifierItinerary): number {
  const dayCount = itinerary.days.length;
  return dayCount > 1 ? dayCount - 1 : dayCount;
}

/**
 * Extract the feature vector. Pure over (rfq, itinerary, config). Booleans that
 * depend on a config threshold read `false`/neutral when that threshold is
 * absent, so an unconfigured engine never fabricates a business judgement.
 */
export function extractSignals(
  rfq: ClassifierRfq,
  itinerary: ClassifierItinerary,
  config: ClassifierConfig,
): ClassificationSignals {
  const items = flattenItems(itinerary);

  const hotelItems = items.filter((i) => i.type === 'hotel');
  const distinctHotels = new Set(hotelItems.map((i) => i.title.trim().toLowerCase()));
  const distinctCorridors = new Set(
    items.map((i) => i.route_pack_id).filter((v): v is string => typeof v === 'string' && v !== ''),
  );

  const externalActivityOrExperience = items.some((i) => i.type === 'activity' || i.type === 'experience');
  const transferPresent = items.some((i) => i.type === 'transfer');
  const multiProperty = distinctHotels.size > 1;
  // Multi-city is not a first-class contract field; distinct route_pack corridors
  // are the closest available proxy (see itinerary.schema route_pack_id).
  const multiCity = distinctCorridors.size > 1;

  const kids = rfq.travellers.kids ?? [];
  const guestCount = rfq.travellers.adults + kids.length;
  const kidsActivityRequirement =
    kids.length > 0 && (externalActivityOrExperience || rfq.inclusions.includes('activities'));

  const nights = durationNights(itinerary);
  const budget = rfq.hotel.budget_per_night.amount;

  const celebrations = rfq.occasion.details?.celebrations ?? [];
  const offPropertySurprise = rfq.occasion.type === 'surprise' && externalActivityOrExperience;

  const guestCountOverThreshold =
    config.guest_count_max !== undefined && guestCount > config.guest_count_max;

  const weddingEscalation =
    celebrations.some((c) => config.escalation_celebration_kinds.includes(c.kind)) ||
    config.escalation_occasion_types.includes(rfq.occasion.type);

  return {
    has_package: Boolean(rfq.package_id ?? itinerary.package_id),
    wedding_escalation: weddingEscalation,
    external_activity_or_experience: externalActivityOrExperience,
    transfer_present: transferPresent,
    multi_property: multiProperty,
    multi_city: multiCity,
    kids_activity_requirement: kidsActivityRequirement,
    guest_count: guestCount,
    guest_count_over_threshold: guestCountOverThreshold,
    duration_nights: nights,
    off_property_surprise: offPropertySurprise,
    within_budget_band: config.hotel_budget_max !== undefined && budget <= config.hotel_budget_max,
    within_duration_band:
      config.max_duration_nights !== undefined && nights <= config.max_duration_nights,
    destination_coverage_known: rfq.destination.mode === 'place' && Boolean(rfq.destination.place),
    single_property: !multiProperty && !multiCity,
    low_celebration_complexity: celebrations.length <= 1,
    no_kids: kids.length === 0,
  };
}

/**
 * Confidence that the trip is genuinely a simple, hotel-fulfillable stay
 * (0..1) = fraction of APPLICABLE hotel-favourable soft signals satisfied.
 * A soft signal governed by a config threshold is "applicable" only once that
 * threshold is set — so confidence reflects real, configured policy.
 */
export function hotelConfidence(signals: ClassificationSignals, config: ClassifierConfig): number {
  const checks: boolean[] = [
    signals.single_property,
    signals.destination_coverage_known,
    signals.low_celebration_complexity,
    signals.no_kids,
  ];
  if (config.hotel_budget_max !== undefined) checks.push(signals.within_budget_band);
  if (config.max_duration_nights !== undefined) checks.push(signals.within_duration_band);
  if (config.guest_count_max !== undefined) checks.push(!signals.guest_count_over_threshold);

  const satisfied = checks.filter(Boolean).length;
  return checks.length === 0 ? 0 : satisfied / checks.length;
}

interface RuleHit {
  route: FulfilmentRoute;
  rule_id: string;
  reason: string;
  triggering: string[];
  confidence: number;
}

/** DMC-forcing rules (FR12.1) — each triggering signal is its own audited rule. */
function forcingRule(signals: ClassificationSignals): RuleHit | undefined {
  if (signals.external_activity_or_experience) {
    return {
      route: 'dmc',
      rule_id: RULE_IDS.dmcActivity,
      reason: 'External activity/experience item requires DMC coordination.',
      triggering: ['external_activity_or_experience'],
      confidence: 1,
    };
  }
  if (signals.transfer_present) {
    return {
      route: 'dmc',
      rule_id: RULE_IDS.dmcTransfer,
      reason: 'Transfer/transport item requires DMC coordination.',
      triggering: ['transfer_present'],
      confidence: 1,
    };
  }
  if (signals.multi_property || signals.multi_city) {
    return {
      route: 'dmc',
      rule_id: RULE_IDS.dmcMultiProperty,
      reason: 'Multi-property / multi-city itinerary requires DMC coordination.',
      triggering: [
        ...(signals.multi_property ? ['multi_property'] : []),
        ...(signals.multi_city ? ['multi_city'] : []),
      ],
      confidence: 1,
    };
  }
  if (signals.kids_activity_requirement) {
    return {
      route: 'dmc',
      rule_id: RULE_IDS.dmcKidsActivity,
      reason: 'Kids-activity requirement requires DMC coordination.',
      triggering: ['kids_activity_requirement'],
      confidence: 1,
    };
  }
  if (signals.guest_count_over_threshold) {
    return {
      route: 'dmc',
      rule_id: RULE_IDS.dmcGuestCount,
      reason: 'Guest count above configured threshold requires DMC coordination.',
      triggering: ['guest_count_over_threshold'],
      confidence: 1,
    };
  }
  if (signals.off_property_surprise) {
    return {
      route: 'dmc',
      rule_id: RULE_IDS.dmcOffPropertySurprise,
      reason: 'High-complexity off-property surprise choreography requires DMC coordination.',
      triggering: ['off_property_surprise'],
      confidence: 1,
    };
  }
  return undefined;
}

/**
 * Evaluate the rule set in priority order (first match wins) and return the
 * winning route with its rule_id, confidence and triggering signals.
 */
function evaluate(signals: ClassificationSignals, config: ClassifierConfig): RuleHit {
  // 1. Package-pinned path — a package_id short-circuits open classification.
  if (signals.has_package) {
    return {
      route: 'package_pinned',
      rule_id: RULE_IDS.packagePinned,
      reason: 'RFQ carries a package_id → pinned fulfilment path.',
      triggering: ['has_package'],
      confidence: 1,
    };
  }

  // 2. Celebration/wedding escalation (config-driven).
  if (signals.wedding_escalation) {
    return {
      route: 'celebration_manager',
      rule_id: RULE_IDS.weddingEscalation,
      reason: 'Occasion escalates to the celebration/wedding manager.',
      triggering: ['wedding_escalation'],
      confidence: 1,
    };
  }

  // 3. Hard DMC forcers (FR12.1).
  const forced = forcingRule(signals);
  if (forced) return forced;

  // 4/5/6. Confidence-graded routing with asymmetric bias (FR12.2/FR12.3).
  const confidence = hotelConfidence(signals, config);
  const triggering = [
    ...(signals.single_property ? ['single_property'] : []),
    ...(signals.destination_coverage_known ? ['destination_coverage_known'] : []),
    ...(signals.low_celebration_complexity ? ['low_celebration_complexity'] : []),
    ...(signals.within_budget_band ? ['within_budget_band'] : []),
    ...(signals.within_duration_band ? ['within_duration_band'] : []),
  ];

  if (config.hotel_confidence_min !== undefined && confidence >= config.hotel_confidence_min) {
    return {
      route: 'hotel',
      rule_id: RULE_IDS.hotelHighConfidence,
      reason: 'Simple single-property stay with high classifier confidence → direct hotel (Track B).',
      triggering,
      confidence,
    };
  }

  if (config.dual_band_min !== undefined && confidence >= config.dual_band_min) {
    return {
      route: 'dual',
      rule_id: RULE_IDS.dualMidBand,
      reason: 'Mid-band / borderline confidence → dual route; M7 compares across tracks.',
      triggering,
      confidence,
    };
  }

  // Mandatory default — deterministic, asymmetric-bias-safe (FR12.2).
  return {
    route: 'dmc',
    rule_id: RULE_IDS.defaultDmc,
    reason: 'Ambiguous or unconfigured → default DMC route (asymmetric bias).',
    triggering: triggering.length > 0 ? triggering : ['default'],
    confidence: 1 - confidence,
  };
}

/**
 * PURE entry point. Classify an RFQ + itinerary into a fulfilment route.
 * `decided_at` is injected by the caller so this function stays clock-free and
 * fully deterministic (BR-16).
 */
export function classifyRoute(
  rfq: ClassifierRfq,
  itinerary: ClassifierItinerary,
  config: ClassifierConfig,
  decidedAt: string,
): ClassificationDecision {
  const signals = extractSignals(rfq, itinerary, config);
  const hit = evaluate(signals, config);
  return {
    rfq_id: rfq.rfq_id,
    itinerary_id: itinerary.itinerary_id,
    itinerary_version: itinerary.version,
    route: hit.route,
    track: ROUTE_TRACK[hit.route],
    confidence: hit.confidence,
    rule_id: hit.rule_id,
    reason: hit.reason,
    triggering_signals: hit.triggering,
    signals,
    kind: 'classified',
    decided_at: decidedAt,
  };
}
