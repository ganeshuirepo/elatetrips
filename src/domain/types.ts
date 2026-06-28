/**
 * Domain types for the ElateTrips planner. These model the data and state that
 * the original single-component app held informally; here they are explicit and
 * strict so the business rules (combinations, age-gating, pax caps) are checked
 * at compile time.
 */

export interface Destination {
  id: string;
  name: string;
  tag: string;
  icon: string;
  on: boolean;
  lat: number;
  lon: number;
}

export type CelebCategory = 'celebration' | 'rejuvenate';

export interface Celebration {
  id: string;
  name: string;
  icon: string;
  img: string;
  /** Which picker group the occasion belongs to. */
  category: CelebCategory;
}

export interface Vehicle {
  id: string;
  name: string;
  sub: string;
  max: number;
  /** Per-km rate in ₹ (used for complete-trip pickups). */
  rate: number;
  /** Per-day package rate in ₹ for local sightseeing (8 hrs / 80 km). */
  localRate: number;
}

export interface OptionItem {
  id: string;
  name: string;
  icon: string;
}

export type PropertyTypeId =
  | 'hotel'
  | 'resort'
  | 'villa'
  | 'homestay'
  | 'apartment'
  | 'cottage'
  | 'guesthouse';

export type RoomSizeId = 'standard' | 'deluxe' | 'suite' | 'family';

export interface Hotel {
  id: string;
  name: string;
  area: string;
  type: PropertyTypeId;
  stars: number;
  price: number;
  rating: number;
  reviews: number;
  tag: string;
  amenities: string[];
  activities: string[];
  roomSizes: RoomSizeId[];
  views: string[];
  climate: string[];
}

export interface RoomMeta {
  name: string;
  mult: number;
  sqft: number;
  bed: string;
  occ: string;
}

/** A bookable adventure or experience shown as a dated voucher. */
export interface Voucher {
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
}

export interface ShopCategory {
  id: string;
  name: string;
}

export interface ShopCatalog {
  title: string;
  subtitle: string;
  cats: ShopCategory[];
  products: Product[];
}

export type ShopKey = 'gifts' | 'medical';

/** Inclusive [min, max] year range a package is suitable for. */
export type AgeRange = readonly [number, number];

/** Per-celebration voucher selection state (day + headcount). */
export interface VoucherMeta {
  day: string;
  qty: number;
}

/** Cart maps product id → quantity. */
export type Cart = Record<string, number>;
