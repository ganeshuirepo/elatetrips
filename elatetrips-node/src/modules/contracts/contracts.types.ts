/**
 * TypeScript mirror of the frozen contracts-v1.1 surface (BR-7, one canonical
 * model). Source of truth: the bundled `./schemas/*.schema.json` (copied from the
 * shared `/contracts` surface) + `/contracts/events.md`. The ajv validators in
 * `contract.validation.ts` are the runtime proof these stay in step.
 */

export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED';

/** Money in integer MINOR units + explicit currency (NFR). */
export interface Money {
  amount: number;
  currency: Currency;
}

export type CostBand = 'budget' | 'mid' | 'premium' | 'luxury';

export type OccasionType = 'celebration' | 'surprise' | 'event' | 'adventure' | 'leisure';
export type CelebrationKind =
  | 'birthday'
  | 'anniversary'
  | 'honeymoon'
  | 'wedding'
  | 'bachelor'
  | 'milestone'
  | 'wellness'
  | 'proposal';

export interface Celebration {
  kind: CelebrationKind;
  day?: string;
  age?: number;
  decor?: boolean;
  cake?: boolean;
}

export type RfqStatus =
  | 'draft'
  | 'review'
  | 'submitted'
  | 'quoting'
  | 'quoted'
  | 'confirmed'
  | 'booked'
  | 'closed';

export interface Rfq {
  rfq_id: string;
  version: number;
  itinerary_id?: string;
  package_id?: string;
  status: RfqStatus;
  occasion: {
    type: OccasionType;
    details?: {
      celebrations?: Celebration[];
      what?: string;
      decor?: boolean;
      privacy?: boolean;
      notes?: string;
    };
  };
  destination: { mode: 'place' | 'suggest_for_me'; place?: string; region_pref?: string };
  dates: { start?: string; end?: string; flex_days: number };
  travellers: { adults: number; kids: { age: number }[] };
  hotel: { budget_per_night: Money; category: 3 | 4 | 5; notes?: string };
  inclusions: ('meals' | 'transfers' | 'activities' | 'experiences')[];
  occasion_specifics?: Record<string, unknown>;
  notes?: string;
}

export type ItineraryItemType = 'hotel' | 'activity' | 'transfer' | 'meal' | 'experience';
export type TimeBlock = 'morning' | 'afternoon' | 'evening' | 'night' | 'full_day';

export interface ItineraryItem {
  item_id: string;
  type: ItineraryItemType;
  title: string;
  time_block?: TimeBlock;
  est_cost_band?: CostBand;
  locked: boolean;
  source: 'ai' | 'master_db' | 'customer';
  route_pack_id?: string;
}

export interface Itinerary {
  itinerary_id: string;
  version: number;
  rfq_id?: string;
  package_id?: string;
  days: { day_index: number; date?: string; items: ItineraryItem[] }[];
}

export interface Supplier {
  supplier_id: string;
  type: 'dmc' | 'hotel' | 'adventure' | 'experience' | 'transport';
  name: string;
  destinations: string[];
  track: 'A' | 'B';
  tier?: 'primary' | 'bench' | 'reserve';
  declared_tat_hours: number;
  contract_accepted: boolean;
  comms_consent?: { sms?: boolean; email?: boolean; whatsapp?: boolean; voice?: boolean };
}

export type QuoteStatus =
  | 'draft'
  | 'submitted'
  | 'scored'
  | 'shortlisted'
  | 'expired'
  | 'selected'
  | 'reconfirmed'
  | 'rejected';

export interface QuoteLineItem {
  item_id: string;
  response: 'can' | 'cannot' | 'alternate';
  alternate?: string;
  price?: Money;
  notes?: string;
}

export interface MatchScore {
  value: number;
  breakdown: {
    budget_fit: number;
    coverage: number;
    locked_compliance: number;
    supplier_reliability: number;
    validity_buffer: number;
  };
}

export interface Quote {
  quote_id: string;
  rfq_id: string;
  itinerary_version: number;
  supplier_id: string;
  policy_id?: string;
  line_items: QuoteLineItem[];
  total: Money;
  validity_ts: string;
  payment_terms?: string;
  partial: boolean;
  channel: 'card' | 'parsed_email';
  match_score?: MatchScore;
  status: QuoteStatus;
  enrichment?: {
    requests?: { item: string; asked_ts: string }[];
    responses?: { item: string; media?: string[]; text?: string; ts: string }[];
  };
  negotiation?: {
    target_total?: Money;
    rounds?: { by: 'ai' | 'supplier' | 'ops'; amount: Money; message?: string; ts: string }[];
    max_rounds?: 2;
  };
}

export interface RefundBand {
  days_before: number;
  refund_pct: number;
}

export interface Policy {
  policy_id: string;
  version: number;
  scope: 'platform_default' | 'partner' | 'quote';
  partner_id?: string;
  quote_id?: string;
  effective_from: string;
  effective_to?: string;
  booking_terms?: { deposit_pct?: number; balance_due_days_before?: number };
  refund_bands: RefundBand[];
  peak_overrides?: { from: string; to: string; refund_bands: RefundBand[] }[];
  flexibility_score?: number;
}

export interface RoutePack {
  route_pack_id: string;
  destination: string;
  corridor: string;
  ordered_pois: string[];
  day_span: number;
  cost_band?: CostBand;
  sellable_as_day_item: boolean;
}

export interface Poi {
  poi_id: string;
  name: string;
  destination: string;
  category: 'sight' | 'activity' | 'experience' | 'dining' | 'nature' | 'adventure' | 'wellness';
  geo?: { lat: number; lng: number };
  typical_duration_min?: number;
  cost_band?: CostBand;
  tags?: string[];
}

export interface Package {
  package_id: string;
  partner_id: string;
  title: string;
  destination: string;
  occasion_tags?: OccasionType[];
  base_itinerary_id: string;
  base_price: Money;
  policy_id?: string;
  category?: 3 | 4 | 5;
  published: boolean;
}

export interface PackageDelta {
  delta_id: string;
  package_id: string;
  rfq_id?: string;
  routed_to_partner_id: string;
  changes: { item_id?: string; op: 'add' | 'remove' | 'modify'; detail?: string; price_delta?: Money }[];
  total_delta?: Money;
  status: 'draft' | 'sent' | 'quoted' | 'accepted' | 'rejected' | 'broadcast';
}

export type EventType =
  | 'rfq.created'
  | 'rfq.edited'
  | 'rfq.submitted'
  | 'itinerary.built'
  | 'itinerary.item.locked'
  | 'wave.sent'
  | 'link.opened'
  | 'quote.submitted'
  | 'quote.parsed'
  | 'quote.scored'
  | 'quote.shortlisted'
  | 'enrichment.requested'
  | 'enrichment.received'
  | 'negotiation.round'
  | 'quote.reconfirmed'
  | 'payment.captured'
  | 'voucher.received'
  | 'policy.snapshotted'
  | 'followup.sent'
  | 'followup.completed';

export type Actor = 'customer' | 'ops' | 'supplier' | 'system';
export type Role = 'customer' | 'dmc' | 'hotel' | 'provider' | 'ops' | 'platform';

export interface AuditEvent {
  event_id: string;
  type: EventType;
  actor: Actor;
  actor_id: string;
  role: Role;
  ts: string;
  subject: { rfq_id?: string; quote_id?: string; booking_id?: string };
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  payload: Record<string, unknown>;
}
