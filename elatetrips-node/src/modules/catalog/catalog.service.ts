import type { IReadRepository } from '../../common/interfaces/IReadRepository';
import type { IHotelRepository } from './hotel.repository';
import { NotFoundError } from '../../common/errors/AppError';
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
  packages: IReadRepository<CelebrationPackage>;
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

  listPackages(): Promise<CelebrationPackage[]> {
    return this.repos.packages.findAll();
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
