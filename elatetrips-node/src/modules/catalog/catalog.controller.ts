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
    return ok(res, hotels, { count: hotels.length });
  };

  hotelById = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.getHotel(req.params.id));

  hotelOptions = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.listHotelOptions());

  celebrations = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.listCelebrations());

  packages = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.listPackages());

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
