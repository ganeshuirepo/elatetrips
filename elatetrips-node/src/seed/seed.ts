import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../common/logger';
import {
  DestinationModel,
  VehicleModel,
  RoomModel,
  HotelModel,
  OptionModel,
  CelebrationModel,
  ExperienceFacetModel,
  PackageOptionModel,
  PackageModel,
  CelebrationBundleModel,
  ActivityModel,
  ProductModel,
  ShopCatalogModel,
} from '../modules/catalog/catalog.models';
import { SupportStaffModel, SupportVendorModel } from '../modules/support/support.models';
import { ConsoleUserModel } from '../modules/admin/console.model';
import bcrypt from 'bcryptjs';

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
  experienceFacets,
  packageOptions,
  packages,
  celebrationBundles,
  adventures,
  experiences,
  products,
  shopCatalogs,
  supportStaff,
  supportVendors,
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
 *
 * Name one or more collections as arguments to reload only those — e.g.
 * `npm run seed -- celebrationBundles`. Worth reaching for when the database is
 * shared: a one-field change to one collection has no business wiping the other
 * twelve. No arguments reloads everything, as before.
 */
async function seed(): Promise<void> {
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
      'experienceFacets',
      async () => (
        await ExperienceFacetModel.deleteMany({}),
        ExperienceFacetModel.insertMany(experienceFacets)
      ),
    ],
    [
      'packageOptions',
      async () => (
        await PackageOptionModel.deleteMany({}),
        PackageOptionModel.insertMany(packageOptions)
      ),
    ],
    [
      'packages',
      async () => (
        await PackageModel.deleteMany({}),
        PackageModel.insertMany(packages.map((p) => ({ ...p, category: categoryFor(p.name) })))
      ),
    ],
    [
      'celebrationBundles',
      async () => (
        await CelebrationBundleModel.deleteMany({}),
        CelebrationBundleModel.insertMany(celebrationBundles)
      ),
    ],
    ['activities', async () => (await ActivityModel.deleteMany({}), ActivityModel.insertMany(buildActivities()))],
    ['products', async () => (await ProductModel.deleteMany({}), ProductModel.insertMany(products))],
    ['shopCatalogs', async () => (await ShopCatalogModel.deleteMany({}), ShopCatalogModel.insertMany(shopCatalogs))],
    ['supportStaff', async () => (await SupportStaffModel.deleteMany({}), SupportStaffModel.insertMany(supportStaff))],
    ['supportVendors', async () => (await SupportVendorModel.deleteMany({}), SupportVendorModel.insertMany(supportVendors))],
    /**
     * Console logins for the support roles: username = the row id (cm-meera,
     * v-oo-cake1…), shared mock password Elate@123. Upserted rather than wiped
     * so reseeding support data never logs the whole ops team out — and the
     * admin/vendor accounts in the same collection are never touched.
     */
    ['supportLogins', async () => {
      const hash = bcrypt.hashSync('Elate@123', 10);
      const rows = [
        ...supportStaff.map((s) => ({
          username: s.id, displayName: s.name, role: s.role, refId: s.id,
        })),
        ...supportVendors.map((v) => ({
          username: v.id, displayName: v.name, role: 'crew' as const, refId: v.id,
        })),
      ];
      for (const r of rows) {
        await ConsoleUserModel.updateOne(
          { username: r.username },
          { $set: { ...r, passwordHash: hash }, $setOnInsert: { createdAt: new Date().toISOString() } },
          { upsert: true },
        );
      }
      return rows.length;
    }],
  ];

  // Argument checking happens BEFORE connecting: a typo should cost nothing and
  // must never reach the database.
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const unknown = only.filter((n) => !tasks.some(([name]) => name === n));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown collection(s): ${unknown.join(', ')}. Known: ${tasks.map(([n]) => n).join(', ')}`,
    );
  }

  const selected = only.length > 0 ? tasks.filter(([name]) => only.includes(name)) : tasks;
  if (only.length > 0) logger.info(`Seeding only: ${selected.map(([n]) => n).join(', ')}`);

  await connectDatabase();

  for (const [name, run] of selected) {
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
