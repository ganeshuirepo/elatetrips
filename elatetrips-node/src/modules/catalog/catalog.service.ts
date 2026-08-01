/**
 * CatalogService — the business-logic layer of the catalog module, sitting
 * between CatalogController and the repositories. Most methods are thin
 * pass-throughs to a read repository; the ones that carry real logic are
 * checkAvailability (hold simulation), listHotelOptions (group-by), and
 * listExperienceFacets (place-aware facet derivation). It depends only on the
 * IReadRepository / IHotelRepository contracts, never on Mongoose, so it can be
 * unit-tested with in-memory fakes.
 */
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
  PackageFilterChip,
  PackageFilterGroup,
  PackageOption,
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
  packageOptions: IReadRepository<PackageOption>;
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

  /**
   * Places in a STABLE order: bookable destinations first, live ones ahead of
   * coming-soon, then alphabetically.
   *
   * Sorted here rather than left to Mongo. Natural order depends on insertion
   * and storage, so the same code served the picker in a different order in
   * every environment — the kind of difference that reads as a bug and cannot
   * be reproduced locally.
   */
  async listDestinations(): Promise<Destination[]> {
    const rank = (d: Destination) => (d.kind === 'city' ? 1 : 0);
    return (await this.repos.destinations.findAll()).sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Number(b.on) - Number(a.on) ||
        a.name.localeCompare(b.name),
    );
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

  /**
   * The whole filter bar for the packages screen, assembled server-side so the
   * client hardcodes no group, chip or order.
   *
   * Every chip is earned: a group only offers what the packages at these
   * destinations can actually satisfy, so nothing is offered that would return
   * an empty strip. That is the same rule listExperienceFacets applies, extended
   * to occasions and cab classes.
   *
   * No destination ids = the full vocabulary, unscoped.
   */
  async listPackageFilters(destIds: string[]): Promise<PackageFilterGroup[]> {
    const [facets, bundles] = await Promise.all([
      this.listExperienceFacets(destIds),
      this.repos.bundles.findAll(),
    ]);

    const inScope =
      destIds.length === 0
        ? bundles
        : bundles.filter((b) => {
            const dests = b.legs?.length ? b.legs.map((l) => l.dest) : [b.dest];
            return dests.some((d) => destIds.includes(d));
          });

    // Occasions actually on sale here. 'milestone' is a catch-all rather than
    // something anyone shops for, so it never becomes a chip.
    const occasions = new Map<string, string>();
    inScope.forEach((b) => {
      if (b.occasion !== 'milestone') occasions.set(b.occasion, b.occLabel);
    });
    const occChips: PackageFilterChip[] = Array.from(occasions, ([id, label]) => ({ id, label }));
    // Group size is not an occasion, but travellers shop by it, so it rides
    // along in this group as a pseudo-chip.
    if (inScope.some((b) => b.groupSize)) occChips.push({ id: '__group', label: 'Group' });

    // Activities and Experiences stay separate axes: one is what you go and do,
    // the other is what the package already includes.
    const facetChips = (group: 'activity' | 'experience'): PackageFilterChip[] =>
      facets
        .filter((f) => f.group === group)
        .map((f) => ({ id: f.id, label: f.label, icon: f.icon, tags: f.tags }));

    // Event types, offered only where a package here carries one — the same rule
    // as every other chip, so nothing is listed that would return an empty strip.
    const EVENT_LABELS: { id: string; label: string; icon: string }[] = [
      { id: 'culture', label: 'Culture', icon: '🎭' },
      { id: 'music', label: 'Music', icon: '🎶' },
      { id: 'corporate', label: 'Corporate', icon: '💼' },
      { id: 'sporting', label: 'Sporting', icon: '🏅' },
    ];
    const eventChips: PackageFilterChip[] = EVENT_LABELS.filter((e) =>
      inScope.some((b) => b.events?.includes(e.id)),
    );

    const groups: PackageFilterGroup[] = [
      { id: 'occ', label: 'Celebration', icon: '🎉', multi: true, match: 'occasion', order: 10, chips: occChips },
      { id: 'act', label: 'Activities', icon: '🎯', multi: true, match: 'tags', order: 20, chips: facetChips('activity') },
      { id: 'exp', label: 'Experiences', icon: '✨', multi: true, match: 'tags', order: 30, chips: facetChips('experience') },
      { id: 'events', label: 'Events', icon: '🎪', multi: true, match: 'events', order: 40, chips: eventChips },
    ];

    // A group with nothing to offer here is dropped rather than shipped empty.
    return groups.filter((g) => g.chips.length > 0).sort((a, b) => a.order - b.order);
  }

  /**
   * The priced customization tiers for the plan page — decoration, star, room
   * and cab groups. Global (not per-place/per-package); sorted by group order.
   */
  async listPackageOptions(): Promise<PackageOption[]> {
    return (await this.repos.packageOptions.findAll()).sort((a, b) => a.order - b.order);
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

  /**
   * Translate the UI product filters into a single Mongo query. Only provided
   * fields are added (an absent filter matches everything); min/maxPrice are
   * merged into one `price` range object so both bounds apply together.
   */
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
