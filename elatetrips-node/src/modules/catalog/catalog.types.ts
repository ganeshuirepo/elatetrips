/** Catalog DTOs — mirror the frontend domain types so the API is a drop-in source. */

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

export interface Vehicle {
  id: string;
  name: string;
  sub: string;
  max: number;
  rate: number;
  localRate: number;
}

export interface Room {
  id: string;
  name: string;
  mult: number;
  sqft: number;
  bed: string;
  occ: string;
}

export interface Hotel {
  id: string;
  name: string;
  area: string;
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
export interface ExperienceFacet {
  id: string;
  label: string;
  icon: string;
  /** Canonical package experience tags this facet covers. */
  tags: string[];
  /** Display order, low first. */
  order: number;
}
