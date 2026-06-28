import { Schema, model } from 'mongoose';
import type {
  Destination,
  Vehicle,
  Room,
  Hotel,
  OptionItem,
  Celebration,
  CelebrationPackage,
  Activity,
  Product,
  ShopCatalog,
} from './catalog.types';

/*
 * Reference-data models. These collections are read-only at runtime (populated
 * by the seed script), so the schemas are intentionally lightweight. Each has a
 * stable string `id` (e.g. "h1", "ooty") used for lookups instead of _id.
 */

const opts = { versionKey: false } as const;

const destinationSchema = new Schema<Destination>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: String,
    tag: String,
    icon: String,
    on: Boolean,
    lat: Number,
    lon: Number,
  },
  opts,
);

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

const optionSchema = new Schema<OptionItem>(
  {
    group: { type: String, required: true, index: true },
    id: { type: String, required: true },
    name: String,
    icon: String,
  },
  opts,
);
optionSchema.index({ group: 1, id: 1 }, { unique: true });

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
activitySchema.index({ kind: 1, id: 1 }, { unique: true });

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

const shopCatalogSchema = new Schema<ShopCatalog>(
  {
    shop: { type: String, required: true, unique: true, index: true },
    title: String,
    subtitle: String,
    cats: [{ _id: false, id: String, name: String }],
  },
  opts,
);

export const DestinationModel = model<Destination>('Destination', destinationSchema);
export const VehicleModel = model<Vehicle>('Vehicle', vehicleSchema);
export const RoomModel = model<Room>('Room', roomSchema);
export const HotelModel = model<Hotel>('Hotel', hotelSchema);
export const OptionModel = model<OptionItem>('Option', optionSchema);
export const CelebrationModel = model<Celebration>('Celebration', celebrationSchema);
export const PackageModel = model<CelebrationPackage>('Package', packageSchema);
export const ActivityModel = model<Activity>('Activity', activitySchema);
export const ProductModel = model<Product>('Product', productSchema);
export const ShopCatalogModel = model<ShopCatalog>('ShopCatalog', shopCatalogSchema);
