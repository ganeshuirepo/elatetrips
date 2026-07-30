import { Schema, model } from 'mongoose';
import type {
  Destination,
  Vehicle,
  Room,
  Hotel,
  OptionItem,
  Celebration,
  ExperienceFacet,
  PackageOption,
  CelebrationPackage,
  CelebrationBundle,
  Activity,
  Product,
  ShopCatalog,
} from './catalog.types';

/*
 * Reference-data models. These collections are read-only at runtime (populated
 * by the seed script), so the schemas are intentionally lightweight. Each has a
 * stable string `id` (e.g. "h1", "ooty") used for lookups instead of _id.
 */

// Shared schema options: drop Mongoose's `__v` version key from stored docs.
const opts = { versionKey: false } as const;

// Destinations/cities shown in pickers. `kind` is indexed so queries can split
// full-app destinations from experiences-only cities.
const destinationSchema = new Schema<Destination>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: String,
    tag: String,
    icon: String,
    kind: { type: String, index: true, default: 'destination' },
    on: Boolean,
    lat: Number,
    lon: Number,
  },
  opts,
);

// Cab vehicle types with seating (`max`) and per-km rates (outstation + local).
const vehicleSchema = new Schema<Vehicle>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: String,
    sub: String,
    max: Number,
    rate: Number,
    localRate: Number,
  },
  opts,
);

// Room types + metadata: `mult` is the price multiplier, plus size, bed, occupancy.
const roomSchema = new Schema<Room>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: String,
    mult: Number,
    sqft: Number,
    bed: String,
    occ: String,
  },
  opts,
);

// Hotels. `type`, `stars` and `price` are indexed because they back the
// filtered listing query in HotelRepository.findFiltered.
const hotelSchema = new Schema<Hotel>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: String,
    area: String,
    type: { type: String, index: true },
    stars: { type: Number, index: true },
    price: { type: Number, index: true },
    rating: Number,
    reviews: Number,
    tag: String,
    amenities: [String],
    activities: [String],
    roomSizes: [String],
    views: [String],
    climate: [String],
  },
  opts,
);

// Hotel-filter options, each tagged with a `group` (amenities, views, …).
// `group` is indexed for the group-by in CatalogService.listHotelOptions.
const optionSchema = new Schema<OptionItem>(
  {
    group: { type: String, required: true, index: true },
    id: { type: String, required: true },
    name: String,
    icon: String,
  },
  opts,
);
// Compound unique key: an option `id` need only be unique within its group.
optionSchema.index({ group: 1, id: 1 }, { unique: true });

// Celebrations (birthday, anniversary, …) and the package names each offers.
const celebrationSchema = new Schema<Celebration>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: String,
    icon: String,
    img: String,
    category: { type: String, index: true },
    packages: [String],
  },
  opts,
);

// Celebration add-on packages. `name` is the natural key (unique) — celebrations
// reference packages by name. `age` defaults to undefined so an absent range is
// omitted rather than stored as an empty array.
const packageSchema = new Schema<CelebrationPackage>(
  {
    name: { type: String, required: true, unique: true, index: true },
    price: Number,
    icon: String,
    desc: String,
    category: { type: String, index: true },
    includes: [String],
    age: { type: [Number], default: undefined },
  },
  opts,
);

// Complete celebration bundles (stay + food + setup). `dest`/`occasion` indexed
// for listing filters; `experiences` indexed because it drives the place-aware
// facet derivation in CatalogService.listExperienceFacets. `legs` defaults to
// undefined — present only for multi-destination combo itineraries.
const celebrationBundleSchema = new Schema<CelebrationBundle>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: String,
    dest: { type: String, index: true },
    occasion: { type: String, index: true },
    occLabel: String,
    durationLabel: String,
    nights: Number,
    premium: Boolean,
    groupSize: { type: String, default: null },
    availability: String,
    fromPrice: Number,
    unit: String,
    inclusions: [String],
    exclusions: [String],
    experiences: { type: [String], default: [], index: true },
    legs: { type: [{ _id: false, dest: String, nights: Number }], default: undefined },
    // Indexed: the packages screen filters on it directly. Absent = no cab, so
    // there is no default — a missing field must not read as a cab class.
    cabIncluded: { type: String, enum: ['local', 'full'], default: undefined, index: true },
  },
  opts,
);

// Activities split by `kind` (adventure vs experience); `kind`/`category` indexed
// for the /activities filter.
const activitySchema = new Schema<Activity>(
  {
    kind: { type: String, required: true, index: true },
    id: { type: String, required: true },
    name: String,
    sub: String,
    icon: String,
    price: Number,
    category: { type: String, index: true },
    inc: [String],
  },
  opts,
);
// Compound unique key: an activity `id` need only be unique within its kind.
activitySchema.index({ kind: 1, id: 1 }, { unique: true });

// Shop products. `cat` and `shop` are indexed to back the /products filters
// (price/rating ranges are applied by CatalogService.listProducts).
const productSchema = new Schema<Product>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: String,
    cat: { type: String, index: true },
    price: Number,
    mrp: Number,
    rating: Number,
    reviews: Number,
    badge: String,
    icon: String,
    delivery: String,
    shop: { type: String, index: true },
  },
  opts,
);

// Per-shop catalogue metadata (title, subtitle, category list), keyed by `shop`.
const shopCatalogSchema = new Schema<ShopCatalog>(
  {
    shop: { type: String, required: true, unique: true, index: true },
    title: String,
    subtitle: String,
    cats: [{ _id: false, id: String, name: String }],
  },
  opts,
);

// Compile and register each schema as a Mongoose model; repositories import these.
export const DestinationModel = model<Destination>('Destination', destinationSchema);
export const VehicleModel = model<Vehicle>('Vehicle', vehicleSchema);
export const RoomModel = model<Room>('Room', roomSchema);
export const HotelModel = model<Hotel>('Hotel', hotelSchema);
export const OptionModel = model<OptionItem>('Option', optionSchema);
export const CelebrationModel = model<Celebration>('Celebration', celebrationSchema);
export const PackageModel = model<CelebrationPackage>('Package', packageSchema);
export const CelebrationBundleModel = model<CelebrationBundle>('CelebrationBundle', celebrationBundleSchema);
export const ActivityModel = model<Activity>('Activity', activitySchema);
export const ProductModel = model<Product>('Product', productSchema);
export const ShopCatalogModel = model<ShopCatalog>('ShopCatalog', shopCatalogSchema);

// The local-experience filter vocabulary. `tags` are matched against a bundle's
// `experiences` to decide which facets a place offers; `order` is indexed for
// stable, sorted display.
const experienceFacetSchema = new Schema<ExperienceFacet>(
  {
    id: { type: String, required: true, unique: true, index: true },
    // Which filter axis this facet feeds: 'activity' or 'experience'.
    group: { type: String, enum: ['activity', 'experience'], default: 'experience', index: true },
    label: { type: String, required: true },
    icon: { type: String, default: '' },
    tags: { type: [String], default: [] },
    order: { type: Number, default: 0, index: true },
  },
  opts,
);

export const ExperienceFacetModel = model<ExperienceFacet>(
  'ExperienceFacet',
  experienceFacetSchema,
);

const packageOptionSchema = new Schema<PackageOption>(
  {
    id: { type: String, required: true, unique: true, index: true },
    group: { type: String, enum: ['decoration', 'star', 'room', 'cab'], required: true, index: true },
    label: { type: String, required: true },
    note: { type: String, default: '' },
    priceDelta: { type: Number, default: 0 },
    order: { type: Number, default: 0, index: true },
  },
  opts,
);

export const PackageOptionModel = model<PackageOption>('PackageOption', packageOptionSchema);
