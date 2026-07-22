import { randomUUID } from 'node:crypto';
import type { IReadRepository } from '../../common/interfaces/IReadRepository';
import type { IHotelRepository } from './hotel.repository';
import { NotFoundError } from '../../common/errors/AppError';
import type {
  AvailabilityRequest,
  AvailabilityResult,
  Destination,
  Vehicle,
  Room,
  Hotel,
  OptionItem,
  Celebration,
  ExperienceFacet,
  CelebrationPackage,
  CelebrationBundle,
  Activity,
  Product,
  ShopCatalog,
  HotelFilter,
  ProductFilter,
} from './catalog.types';

/** The read repositories the catalog service depends on (Dependency Inversion). */
export interface CatalogRepositories {
  destinations: IReadRepository<Destination>;
  vehicles: IReadRepository<Vehicle>;
  rooms: IReadRepository<Room>;
  hotels: IHotelRepository;
  options: IReadRepository<OptionItem>;
  celebrations: IReadRepository<Celebration>;
  experienceFacets: IReadRepository<ExperienceFacet>;
  packages: IReadRepository<CelebrationPackage>;
  bundles: IReadRepository<CelebrationBundle>;
  activities: IReadRepository<Activity>;
  products: IReadRepository<Product>;
  shopCatalogs: IReadRepository<ShopCatalog>;
}

/**
 * Read-only reference-data use cases. The service holds no persistence details —
 * it orchestrates repositories that satisfy the IReadRepository contract, so it
 * is trivially testable with in-memory fakes.
 */
export class CatalogService {
  constructor(private readonly repos: CatalogRepositories) {}

  listDestinations(): Promise<Destination[]> {
    return this.repos.destinations.findAll();
  }

  listVehicles(): Promise<Vehicle[]> {
    return this.repos.vehicles.findAll();
  }

  listRooms(): Promise<Room[]> {
    return this.repos.rooms.findAll();
  }

  listHotels(filter: HotelFilter): Promise<Hotel[]> {
    return this.repos.hotels.findFiltered(filter);
  }

  async getHotel(id: string): Promise<Hotel> {
    const hotel = await this.repos.hotels.findById(id);
    if (!hotel) throw new NotFoundError(`Hotel not found: ${id}`);
    return hotel;
  }

  /** Minutes a confirmed room is held for while the guest completes payment. */
  static readonly HOLD_MINUTES = 5;

  /**
   * Live availability confirmation with the hotelier (partner-integration
   * stand-in): the room must be one the hotel actually offers; a successful
   * check holds it for HOLD_MINUTES so payment can complete at a locked rate.
   */
  async checkAvailability(hotelId: string, req: AvailabilityRequest): Promise<AvailabilityResult> {
    const hotel = await this.getHotel(hotelId);
    if (!hotel.roomSizes.includes(req.roomId)) {
      return {
        available: false,
        message: `${hotel.name} no longer offers this room type for the selected dates — pick another room.`,
      };
    }
    const holdMinutes = CatalogService.HOLD_MINUTES;
    return {
      available: true,
      holdRef: `HOLD-${randomUUID().slice(0, 8).toUpperCase()}`,
      expiresAt: new Date(Date.now() + holdMinutes * 60_000).toISOString(),
      holdMinutes,
      message: `${hotel.name} confirmed ${req.rooms} × this room for ${req.nights} night(s) — held for ${holdMinutes} minutes.`,
    };
  }

  /** All hotel filter options grouped the way the UI consumes them. */
  async listHotelOptions(): Promise<Record<string, OptionItem[]>> {
    const all = await this.repos.options.findAll();
    return all.reduce<Record<string, OptionItem[]>>((acc, opt) => {
      (acc[opt.group] ??= []).push(opt);
      return acc;
    }, {});
  }

  listCelebrations(): Promise<Celebration[]> {
    return this.repos.celebrations.findAll();
  }

  /**
   * The experience filters worth offering for a set of destinations: a facet
   * appears only when a package there carries one of its tags, so Goa returns
   * water sports and Ooty returns treks without either being hard-coded.
   *
   * No destination ids = the whole vocabulary (admin and discovery views).
   */
  async listExperienceFacets(destIds: string[]): Promise<ExperienceFacet[]> {
    const facets = (await this.repos.experienceFacets.findAll()).sort(
      (a, b) => a.order - b.order,
    );
    if (destIds.length === 0) return facets;

    const bundles = await this.repos.bundles.findAll();
    const inScope = bundles.filter((b) => {
      const dests = b.legs?.length ? b.legs.map((l) => l.dest) : [b.dest];
      return dests.some((d) => destIds.includes(d));
    });
    const present = new Set(inScope.flatMap((b) => b.experiences ?? []));
    return facets.filter((f) => f.tags.some((t) => present.has(t)));
  }

  listPackages(): Promise<CelebrationPackage[]> {
    return this.repos.packages.findAll();
  }

  /** Complete celebration bundles (stay + food + setup), optionally by destination. */
  listCelebrationBundles(dest?: string): Promise<CelebrationBundle[]> {
    return this.repos.bundles.findAll(dest ? { dest } : {});
  }

  listActivities(kind?: 'adventure' | 'experience'): Promise<Activity[]> {
    return this.repos.activities.findAll(kind ? { kind } : {});
  }

  listProducts(filter: ProductFilter = {}): Promise<Product[]> {
    const query: Record<string, unknown> = {};
    if (filter.shop) query.shop = filter.shop;
    if (filter.cat) query.cat = filter.cat;
    if (filter.minRating != null) query.rating = { $gte: filter.minRating };
    if (filter.minPrice != null || filter.maxPrice != null) {
      query.price = {
        ...(filter.minPrice != null ? { $gte: filter.minPrice } : {}),
        ...(filter.maxPrice != null ? { $lte: filter.maxPrice } : {}),
      };
    }
    return this.repos.products.findAll(query);
  }

  listShopCatalogs(): Promise<ShopCatalog[]> {
    return this.repos.shopCatalogs.findAll();
  }
}
