import type { MongoCrudRepository } from '../../repositories/MongoCrudRepository';
import type { MongoReadRepository } from '../../repositories/MongoReadRepository';
import { NotFoundError } from '../../common/errors/AppError';
import type { Activity, CelebrationBundle, Hotel, Vehicle } from '../catalog/catalog.types';
import type {
  ActivityCreate,
  ActivityUpdate,
  BundleCreate,
  BundleUpdate,
  HotelCreate,
  HotelUpdate,
  VehicleCreate,
  VehicleUpdate,
} from './admin.validation';

/** The write-capable repositories the admin console works with. */
export interface AdminRepos {
  hotels: MongoCrudRepository<Hotel>;
  bundles: MongoCrudRepository<CelebrationBundle>;
  vehicles: MongoCrudRepository<Vehicle>;
  activities: MongoCrudRepository<Activity>;
  orders: MongoReadRepository<Record<string, unknown>>;
}

const RECENT_ORDERS = 50;

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Admin catalog management: create/update over the mocked reference data.
 * Reads stay on the public catalog endpoints — this service only writes,
 * plus the little overview/orders feed the dashboards show.
 */
export class AdminService {
  constructor(private readonly repos: AdminRepos) {}

  async overview(): Promise<Record<string, number>> {
    const [hotels, bundles, vehicles, activities, orders] = await Promise.all([
      this.repos.hotels.count(),
      this.repos.bundles.count(),
      this.repos.vehicles.count(),
      this.repos.activities.count(),
      this.repos.orders.count(),
    ]);
    return { hotels, bundles, vehicles, activities, orders };
  }

  /** Latest bookings for the dashboards (mock-scale collection). */
  async listOrders(): Promise<Record<string, unknown>[]> {
    const all = await this.repos.orders.findAll();
    return all
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
      .slice(0, RECENT_ORDERS);
  }

  /** Free id derived from the name; suffixes when the slug is taken. */
  private async uniqueId(
    repo: MongoCrudRepository<{ id?: string }>,
    base: string,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const root = base || 'item';
    let id = root;
    let n = 2;
    while (await repo.findOne({ ...extra, id })) {
      id = `${root}-${n}`;
      n += 1;
    }
    return id;
  }

  async createHotel(input: HotelCreate): Promise<Hotel> {
    const id = input.id ?? (await this.uniqueId(this.repos.hotels, slugify(input.name)));
    return this.repos.hotels.create({ ...input, id });
  }

  async updateHotel(id: string, patch: HotelUpdate): Promise<Hotel> {
    const doc = await this.repos.hotels.updateOne({ id }, patch);
    if (!doc) throw new NotFoundError('Hotel not found');
    return doc;
  }

  async createBundle(input: BundleCreate): Promise<CelebrationBundle> {
    const id = input.id ?? (await this.uniqueId(this.repos.bundles, slugify(input.name)));
    const durationLabel = input.durationLabel ?? `${input.nights}N ${input.nights + 1}D`;
    return this.repos.bundles.create({ ...input, id, durationLabel });
  }

  async updateBundle(id: string, patch: BundleUpdate): Promise<CelebrationBundle> {
    const withLabel =
      patch.nights !== undefined && patch.durationLabel === undefined
        ? { ...patch, durationLabel: `${patch.nights}N ${patch.nights + 1}D` }
        : patch;
    const doc = await this.repos.bundles.updateOne({ id }, withLabel);
    if (!doc) throw new NotFoundError('Package not found');
    return doc;
  }

  async createVehicle(input: VehicleCreate): Promise<Vehicle> {
    const id = input.id ?? (await this.uniqueId(this.repos.vehicles, slugify(input.name)));
    return this.repos.vehicles.create({ ...input, id });
  }

  async updateVehicle(id: string, patch: VehicleUpdate): Promise<Vehicle> {
    const doc = await this.repos.vehicles.updateOne({ id }, patch);
    if (!doc) throw new NotFoundError('Vehicle not found');
    return doc;
  }

  async createActivity(input: ActivityCreate): Promise<Activity> {
    // Activities are keyed by (kind, id), so the slug only needs to be unique
    // *within* its kind — pass kind as extra match criteria to uniqueId.
    const id =
      input.id ??
      (await this.uniqueId(this.repos.activities, slugify(input.name), { kind: input.kind }));
    return this.repos.activities.create({ ...input, id });
  }

  async updateActivity(kind: string, id: string, patch: ActivityUpdate): Promise<Activity> {
    const doc = await this.repos.activities.updateOne({ kind, id }, patch);
    if (!doc) throw new NotFoundError('Activity not found');
    return doc;
  }
}
