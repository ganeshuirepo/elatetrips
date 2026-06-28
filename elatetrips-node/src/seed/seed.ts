import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../common/logger';
import {
  DestinationModel,
  VehicleModel,
  RoomModel,
  HotelModel,
  OptionModel,
  CelebrationModel,
  PackageModel,
  ActivityModel,
  ProductModel,
  ShopCatalogModel,
} from '../modules/catalog/catalog.models';

import {
  destinations,
  vehicles,
  roomMeta,
  hotels,
  amenities,
  roomSizes,
  roomViews,
  climate,
  propertyTypes,
  hotelActivities,
  celebrations,
  packages,
  adventures,
  experiences,
  products,
  shopCatalogs,
  categoryFor,
  activityCategoryFor,
  celebCategoryFor,
} from './data';

/** Flattens the six hotel-option arrays into grouped Option documents. */
function buildOptions() {
  const groups: Record<string, { id: string; name: string; icon: string }[]> = {
    amenities,
    roomSizes,
    roomViews,
    climate,
    propertyTypes,
    hotelActivities,
  };
  return Object.entries(groups).flatMap(([group, items]) =>
    items.map((it) => ({ group, ...it })),
  );
}

function buildActivities() {
  return [
    ...adventures.map((a) => ({ kind: 'adventure' as const, ...a, category: activityCategoryFor(a.id) })),
    ...experiences.map((e) => ({ kind: 'experience' as const, ...e, category: activityCategoryFor(e.id) })),
  ];
}

/**
 * Idempotent seed: wipes the reference collections and reloads them from the
 * ported frontend data. User and Order collections are left untouched.
 */
async function seed(): Promise<void> {
  await connectDatabase();

  const tasks: Array<[string, () => Promise<unknown>]> = [
    ['destinations', async () => (await DestinationModel.deleteMany({}), DestinationModel.insertMany(destinations))],
    ['vehicles', async () => (await VehicleModel.deleteMany({}), VehicleModel.insertMany(vehicles))],
    ['rooms', async () => (await RoomModel.deleteMany({}), RoomModel.insertMany(roomMeta))],
    ['hotels', async () => (await HotelModel.deleteMany({}), HotelModel.insertMany(hotels))],
    ['options', async () => (await OptionModel.deleteMany({}), OptionModel.insertMany(buildOptions()))],
    [
      'celebrations',
      async () => (
        await CelebrationModel.deleteMany({}),
        CelebrationModel.insertMany(
          celebrations.map((c) => ({ ...c, category: celebCategoryFor(c.id) })),
        )
      ),
    ],
    [
      'packages',
      async () => (
        await PackageModel.deleteMany({}),
        PackageModel.insertMany(packages.map((p) => ({ ...p, category: categoryFor(p.name) })))
      ),
    ],
    ['activities', async () => (await ActivityModel.deleteMany({}), ActivityModel.insertMany(buildActivities()))],
    ['products', async () => (await ProductModel.deleteMany({}), ProductModel.insertMany(products))],
    ['shopCatalogs', async () => (await ShopCatalogModel.deleteMany({}), ShopCatalogModel.insertMany(shopCatalogs))],
  ];

  for (const [name, run] of tasks) {
    await run();
    logger.info(`seeded ${name}`);
  }

  await disconnectDatabase();
  logger.info('Seed complete.');
}

seed().catch((err) => {
  logger.error('Seed failed', err);
  process.exit(1);
});
