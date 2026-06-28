/** Catalog DTOs — mirror the frontend domain types so the API is a drop-in source. */

export interface Destination {
  id: string;
  name: string;
  tag: string;
  icon: string;
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
