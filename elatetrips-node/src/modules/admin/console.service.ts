import type { MongoCrudRepository } from '../../repositories/MongoCrudRepository';
import type { MongoReadRepository } from '../../repositories/MongoReadRepository';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from '../../common/errors/AppError';
import type { IPasswordHasher } from '../auth/auth.types';
import { logger } from '../../common/logger';
import type { Activity, CelebrationBundle, Hotel, Vehicle } from '../catalog/catalog.types';
import type { ConsoleUser, VendorType } from './console.model';
import { signConsoleToken, type ConsoleClaims } from './console.token';
import {
  activityUpdateSchema,
  hotelUpdateSchema,
  vehicleUpdateSchema,
  type VendorCreate,
} from './admin.validation';

export interface ConsoleRepos {
  users: MongoCrudRepository<ConsoleUser>;
  hotels: MongoCrudRepository<Hotel>;
  bundles: MongoCrudRepository<CelebrationBundle>;
  vehicles: MongoCrudRepository<Vehicle>;
  activities: MongoCrudRepository<Activity>;
  orders: MongoReadRepository<Record<string, unknown>>;
}

export interface ConsoleSession {
  token: string;
  username: string;
  displayName: string;
  role: 'admin' | 'vendor';
  vendorType?: VendorType;
  refId?: string;
}

export interface VendorProfile {
  username: string;
  displayName: string;
  vendorType?: VendorType;
  refId?: string;
  listing: Record<string, unknown> | null;
}

/** Default console accounts, created once on an empty collection (dev/mock). */
const SEED_ADMIN = { username: 'admin', password: 'Elate@2026', displayName: 'Elate Admin' };
const SEED_VENDOR = {
  username: 'crownvendor',
  password: 'Vendor@123',
  displayName: 'Nilgiri Crown Resort',
  vendorType: 'hotel' as VendorType,
  refId: 'h1',
};

/**
 * Console accounts: admin + vendor login, vendor onboarding (admin creates
 * the account with its one listing binding), and the vendor's own view —
 * profile, listing updates, and bookings that involve their listing.
 */
export class ConsoleService {
  private seeded = false;

  constructor(
    private readonly repos: ConsoleRepos,
    private readonly hasher: IPasswordHasher,
  ) {}

  /** First-run bootstrap so the consoles are usable on a fresh database. */
  private async ensureSeedUsers(): Promise<void> {
    if (this.seeded) return;
    this.seeded = true;
    if ((await this.repos.users.count()) > 0) return;
    await this.repos.users.create({
      username: SEED_ADMIN.username,
      passwordHash: await this.hasher.hash(SEED_ADMIN.password),
      displayName: SEED_ADMIN.displayName,
      role: 'admin',
      createdAt: new Date().toISOString(),
    });
    await this.repos.users.create({
      username: SEED_VENDOR.username,
      passwordHash: await this.hasher.hash(SEED_VENDOR.password),
      displayName: SEED_VENDOR.displayName,
      role: 'vendor',
      vendorType: SEED_VENDOR.vendorType,
      refId: SEED_VENDOR.refId,
      createdAt: new Date().toISOString(),
    });
    logger.info('Console users seeded (admin / vendor demo accounts)');
  }

  async login(username: string, password: string): Promise<ConsoleSession> {
    await this.ensureSeedUsers();
    const user = await this.repos.users.findOne({ username: username.toLowerCase() });
    if (!user || !(await this.hasher.compare(password, user.passwordHash))) {
      throw new UnauthorizedError('Invalid username or password');
    }
    const token = signConsoleToken({
      sub: user.username,
      role: user.role,
      vendorType: user.vendorType,
      refId: user.refId,
      name: user.displayName,
    });
    return {
      token,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      vendorType: user.vendorType,
      refId: user.refId,
    };
  }

  /** Admin onboarding: register the vendor and hand back their credentials. */
  async createVendor(input: VendorCreate): Promise<Omit<VendorProfile, 'listing'>> {
    const username = input.username.toLowerCase();
    if (await this.repos.users.findOne({ username })) {
      throw new BadRequestError('Username already taken');
    }
    if (input.vendorType !== 'ground') {
      const listing = await this.resolveListing(input.vendorType, input.refId ?? '');
      if (!listing) throw new NotFoundError('No listing found for that reference');
    }
    await this.repos.users.create({
      username,
      passwordHash: await this.hasher.hash(input.password),
      displayName: input.displayName,
      role: 'vendor',
      vendorType: input.vendorType,
      refId: input.refId,
      createdAt: new Date().toISOString(),
    });
    return {
      username,
      displayName: input.displayName,
      vendorType: input.vendorType,
      refId: input.refId,
    };
  }

  async listVendors(): Promise<Omit<VendorProfile, 'listing'>[]> {
    await this.ensureSeedUsers();
    const users = await this.repos.users.findAll({ role: 'vendor' });
    return users.map((u) => ({
      username: u.username,
      displayName: u.displayName,
      vendorType: u.vendorType,
      refId: u.refId,
    }));
  }

  private async resolveListing(
    type: VendorType | undefined,
    refId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!type || type === 'ground' || !refId) return null;
    if (type === 'hotel') return (await this.repos.hotels.findOne({ id: refId })) as never;
    if (type === 'cab') return (await this.repos.vehicles.findOne({ id: refId })) as never;
    const [kind, id] = refId.split(':');
    return (await this.repos.activities.findOne({ kind, id })) as never;
  }

  async me(claims: ConsoleClaims): Promise<VendorProfile> {
    const user = await this.repos.users.findOne({ username: claims.sub });
    if (!user) throw new UnauthorizedError('Account no longer exists');
    return {
      username: user.username,
      displayName: user.displayName,
      vendorType: user.vendorType,
      refId: user.refId,
      listing: await this.resolveListing(user.vendorType, user.refId ?? ''),
    };
  }

  /** A vendor updates THEIR one listing — fields validated per vendor type. */
  async updateListing(
    claims: ConsoleClaims,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { vendorType, refId } = claims;
    if (!vendorType || vendorType === 'ground' || !refId) {
      throw new BadRequestError('This account has no listing to edit');
    }
    if (vendorType === 'hotel') {
      const patch = hotelUpdateSchema.parse(body);
      const doc = await this.repos.hotels.updateOne({ id: refId }, patch);
      if (!doc) throw new NotFoundError('Hotel not found');
      return doc as never;
    }
    if (vendorType === 'cab') {
      const patch = vehicleUpdateSchema.parse(body);
      const doc = await this.repos.vehicles.updateOne({ id: refId }, patch);
      if (!doc) throw new NotFoundError('Vehicle not found');
      return doc as never;
    }
    const [kind, id] = refId.split(':');
    const patch = activityUpdateSchema.parse(body);
    const doc = await this.repos.activities.updateOne({ kind, id }, patch);
    if (!doc) throw new NotFoundError('Activity not found');
    return doc as never;
  }

  /** Bookings that involve the vendor's listing (matched on the summary labels). */
  async vendorOrders(claims: ConsoleClaims): Promise<Record<string, unknown>[]> {
    const listing = await this.resolveListing(claims.vendorType, claims.refId ?? '');
    const name = typeof listing?.name === 'string' ? listing.name : null;
    if (!name) return [];
    const all = await this.repos.orders.findAll();
    return all
      .filter((o) => {
        const s = (o.summary ?? {}) as Record<string, unknown>;
        if (claims.vendorType === 'hotel') return String(s.hotelLabel ?? '').includes(name);
        if (claims.vendorType === 'cab') return String(s.transportLabel ?? '').includes(name);
        const lists = [s.experiences, s.adventures].filter(Array.isArray) as string[][];
        return lists.some((l) => l.includes(name));
      })
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  }
}
