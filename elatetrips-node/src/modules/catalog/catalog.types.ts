/** Catalog DTOs — mirror the frontend domain types so the API is a drop-in source. */

/** A place users can book into; `id` (e.g. "ooty") is the stable lookup key. */
export interface Destination {
  id: string;
  name: string;
  tag: string;
  icon: string;
  /** 'destination' = full app (trips + celebrations); 'city' = experiences only. */
  kind: 'destination' | 'city';
  on: boolean;
  lat: number;
  lon: number;
}

/** A cab type: `max` seats, `rate` per km outstation, `localRate` per km in-city. */
export interface Vehicle {
  id: string;
  name: string;
  sub: string;
  max: number;
  rate: number;
  localRate: number;
}

/** A room type; `mult` is the nightly-price multiplier applied to the base rate. */
export interface Room {
  id: string;
  name: string;
  mult: number;
  sqft: number;
  bed: string;
  occ: string;
}

/** A hotel; the array fields (amenities, activities, …) are the filterable facets. */
export interface Hotel {
  id: string;
  name: string;
  area: string;
  /**
   * Destination id this property sits in (ooty | coorg | munnar | goa). `area`
   * is a human neighbourhood string and cannot be filtered on reliably, so the
   * link to a destination is explicit.
   */
  dest: string;
  type: string;
  stars: number;
  price: number;
  rating: number;
  reviews: number;
  tag: string;
  amenities: string[];
  activities: string[];
  roomSizes: string[];
  views: string[];
  climate: string[];
}

/** One selectable hotel-filter option, tagged with the `group` it belongs to. */
export interface OptionItem {
  group: string;
  id: string;
  name: string;
  icon: string;
}

export interface Celebration {
  id: string;
  name: string;
  icon: string;
  img: string;
  /** Picker category: 'celebration' or 'rejuvenate'. */
  category: string;
  packages: string[];
}

export interface CelebrationPackage {
  name: string;
  price: number;
  icon: string;
  desc: string;
  /** Classification, e.g. Music, Decoration, Wellness, Food, Photography. */
  category: string;
  includes: string[];
  age?: [number, number];
}

/**
 * A complete celebration BUNDLE (stay + food + setup) booked as one. Cabs and
 * adventure activities are offered as add-ons at booking time (from the vehicles
 * + adventure catalogs), so they are not stored here.
 */
export interface CelebrationBundle {
  id: string;
  name: string;
  /** Primary destination (first leg for combo itineraries). */
  dest: string;
  occasion: string;
  occLabel: string;
  durationLabel: string;
  nights: number;
  premium: boolean;
  groupSize: string | null;
  availability: 'daily' | 'weekend';
  fromPrice: number;
  unit: string;
  inclusions: string[];
  exclusions: string[];
  /**
   * Experience-type classification (canonical tags: trek, tea, camp,
   * bonfire, picnic, water, kids, culture, food, spa, photoshoot, dining).
   * Powers the Local-experiences filters without text matching.
   */
  experiences?: string[];
  /**
   * Combo itineraries only: the night split across nearby destinations,
   * e.g. [{dest:'ooty',nights:3},{dest:'coorg',nights:2}]. Absent = single-destination.
   * Only geographically-near destinations are ever combined (seed-enforced).
   */
  legs?: { dest: string; nights: number }[];
  /**
   * True when the price already covers a FULL-TRIP cab — airport pickup and
   * every transfer, the `cab-full` tier in seed/data/packageOptions.
   *
   * Only full trips are ever bundled. Local rides are an add-on the traveller
   * chooses on the plan page, never something a package includes, so this is a
   * flag rather than a class.
   *
   * Absent means no cab, and the package lists "add a cab" under exclusions.
   */
  cabIncluded?: boolean;
  /**
   * Event types this package is suited to — culture, music, corporate,
   * sporting. A separate axis from `experiences`: those describe what the trip
   * includes, these describe the kind of occasion it can carry, and a corporate
   * offsite is not an "experience" a package contains.
   */
  events?: string[];
  /**
   * Hotel ids this package can actually run at, curated by ops.
   *
   * A celebration set-up depends on what a property allows and what its staff
   * can host, which amenity tags cannot be trusted to answer — hence a list
   * rather than a rule. Empty means "not curated yet": checkout says the manager
   * will confirm, rather than refusing a hotel on no evidence.
   */
  venues?: string[];
}

export interface Activity {
  kind: 'adventure' | 'experience';
  id: string;
  name: string;
  sub: string;
  icon: string;
  price: number;
  /** Classification, e.g. Land, Water, Aerial, Food, Culture. */
  category: string;
  inc: string[];
}

export interface Product {
  id: string;
  name: string;
  cat: string;
  price: number;
  mrp: number;
  rating: number;
  reviews: number;
  badge: string;
  icon: string;
  delivery: string;
  shop: 'gifts' | 'medical';
}

export interface ShopCatalog {
  shop: 'gifts' | 'medical';
  title: string;
  subtitle: string;
  cats: { id: string; name: string }[];
}

/** Filters accepted by the product listing endpoint. */
export interface ProductFilter {
  shop?: 'gifts' | 'medical';
  cat?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
}

/** Filters accepted by the hotel listing endpoint (mirrors the UI filters). */
export interface HotelFilter {
  /** Restrict to one destination — the packages screen never mixes places. */
  dest?: string;
  stars?: number[];
  amenities?: string[];
  activities?: string[];
  roomSizes?: string[];
  views?: string[];
  climate?: string[];
  types?: string[];
  maxPrice?: number;
}

/** A live availability check with the hotelier before payment. */
export interface AvailabilityRequest {
  roomId: string;
  checkin: string;
  nights: number;
  rooms: number;
}

/** Hotelier confirmation: when available, the room is held until expiresAt. */
export interface AvailabilityResult {
  available: boolean;
  holdRef?: string;
  expiresAt?: string;
  holdMinutes?: number;
  message: string;
}

/**
 * A local-experience filter offered on the packages screen. Which ones appear
 * depends on the place: Goa surfaces water sports, Ooty treks — derived by
 * matching `tags` against the `experiences` tags of that place's packages,
 * so adding a package with a new tag lights its facet up automatically.
 */
/**
 * ── PACKAGE FILTERS ─────────────────────────────────────────────────────────
 * The whole filter bar on the packages screen, described by the server so the
 * client hardcodes no group, chip, label or order. Adding a group here changes
 * the UI with no frontend release.
 *
 * The client stays generic by knowing only the three MATCH KINDS below, never
 * which groups exist. `dest`-scoped like experience-facets: a chip is offered
 * only when a package at that place can satisfy it, so no chip is dead on
 * arrival.
 */
export type PackageFilterMatch =
  /** Chip id is an occasion, or '__group' for group-sized packages. */
  | 'occasion'
  /** Chip carries `tags`; a package matches if it holds any of them. */
  | 'tags'
  /** Chip id is an event type, matched against the package's `events`. */
  | 'events';

/** One selectable chip inside a filter group. */
export interface PackageFilterChip {
  id: string;
  label: string;
  icon?: string;
  /** Only for `match: 'tags'` groups — the package tags this chip covers. */
  tags?: string[];
}

export interface PackageFilterGroup {
  id: string;
  label: string;
  icon: string;
  /**
   * True when several chips can be active at once, OR'd together. The client
   * also reads this as a layout hint: multi groups are shown open, single-choice
   * groups collapse behind their title.
   */
  multi: boolean;
  match: PackageFilterMatch;
  /** Display order across the bar, low first. */
  order: number;
  chips: PackageFilterChip[];
}

export interface ExperienceFacet {
  id: string;
  /**
   * Which filter axis this facet belongs to: 'activity' = active/operator-run
   * (adventure, water, kids), 'experience' = curated local inclusions (tea,
   * food, culture, spa). The frontend renders one filter dropdown per group.
   */
  group: 'activity' | 'experience';
  label: string;
  icon: string;
  /** Canonical package experience tags this facet covers. */
  tags: string[];
  /** Display order within its group, low first. */
  order: number;
}

/**
 * A priced customization tier for a celebration package (plan-page filters).
 * Grouped single-select: decoration | star | room | cab. The first tier per
 * group is the included baseline (priceDelta 0); higher tiers add a flat
 * amount to the package total.
 */
export interface PackageOption {
  id: string;
  group: 'decoration' | 'star' | 'room' | 'cab';
  label: string;
  note: string;
  /** Flat amount added to the package total when this tier is chosen. */
  priceDelta: number;
  /** Display order within its group, low first. */
  order: number;
}
