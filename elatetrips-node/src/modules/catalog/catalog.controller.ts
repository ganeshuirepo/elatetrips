/**
 * CatalogController — the HTTP layer for /api/v1/catalog. One method per route
 * (wired in catalog.routes). Each method: reads the already-validated request,
 * delegates to CatalogService, and writes the result through ok() so every
 * response shares the { success, data, meta? } envelope (see common/http/ApiResponse).
 *
 * Note on the `req.query as ...` casts below: the validate() middleware has
 * already run the matching Zod schema and REPLACED req.query with the coerced
 * result (CSV strings → arrays, numeric strings → numbers), so these casts
 * describe the post-validation shape rather than re-checking it.
 */
import type { Request, Response } from 'express';
import type { CatalogService } from './catalog.service';
import { ok } from '../../common/http/ApiResponse';
import type { HotelFilter } from './catalog.types';

/**
 * Thin HTTP adapter: parses the (already-validated) request, calls the service,
 * and writes the response. No business logic lives here.
 */
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  destinations = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.listDestinations());

  vehicles = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.listVehicles());

  rooms = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.listRooms());

  hotels = async (req: Request, res: Response): Promise<Response> => {
    const q = req.query as Record<string, unknown>;
    const filter: HotelFilter = {
      stars: q.stars as number[] | undefined,
      types: q.types as string[] | undefined,
      amenities: q.amenities as string[] | undefined,
      activities: q.activities as string[] | undefined,
      roomSizes: q.roomSizes as string[] | undefined,
      views: q.views as string[] | undefined,
      climate: q.climate as string[] | undefined,
      maxPrice: q.maxPrice as number | undefined,
    };
    const hotels = await this.service.listHotels(filter);
    // List endpoints attach meta.count so clients get the result size without
    // walking the array (same pattern in celebrationBundles and products).
    return ok(res, hotels, { count: hotels.length });
  };

  hotelById = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.getHotel(req.params.id));

  hotelAvailability = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.checkAvailability(req.params.id, req.body));

  hotelOptions = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.listHotelOptions());

  celebrations = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.listCelebrations());

  /** GET /catalog/package-options — priced plan-page customization tiers. */
  packageOptions = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.listPackageOptions());

  /** GET /catalog/experience-facets?dest=ooty,coorg — place-aware filters. */
  experienceFacets = async (req: Request, res: Response): Promise<Response> => {
    const raw = typeof req.query.dest === 'string' ? req.query.dest : '';
    const destIds = raw.split(',').map((d) => d.trim()).filter(Boolean);
    return ok(res, await this.service.listExperienceFacets(destIds));
  };

  packages = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.listPackages());

  celebrationBundles = async (req: Request, res: Response): Promise<Response> => {
    const dest = req.query.dest as string | undefined;
    const bundles = await this.service.listCelebrationBundles(dest);
    return ok(res, bundles, { count: bundles.length });
  };

  activities = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.listActivities(req.query.kind as 'adventure' | 'experience' | undefined));

  products = async (req: Request, res: Response): Promise<Response> => {
    const q = req.query as Record<string, unknown>;
    const products = await this.service.listProducts({
      shop: q.shop as 'gifts' | 'medical' | undefined,
      cat: q.cat as string | undefined,
      minPrice: q.minPrice as number | undefined,
      maxPrice: q.maxPrice as number | undefined,
      minRating: q.minRating as number | undefined,
    });
    return ok(res, products, { count: products.length });
  };

  shopCatalogs = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.listShopCatalogs());
}
