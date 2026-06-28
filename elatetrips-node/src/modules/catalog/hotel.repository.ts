import { MongoReadRepository } from '../../repositories/MongoReadRepository';
import { HotelModel } from './catalog.models';
import type { Hotel, HotelFilter } from './catalog.types';
import type { IReadRepository } from '../../common/interfaces/IReadRepository';

/** Hotel repository contract — read access plus the filtered listing query. */
export interface IHotelRepository extends IReadRepository<Hotel> {
  findFiltered(filter: HotelFilter): Promise<Hotel[]>;
}

/**
 * Specialises the generic read repository (Open/Closed) by translating the UI's
 * hotel filters into a Mongo query. Multi-select filters are AND/contains
 * (`$all`); stars and types are membership (`$in`); price is an upper bound —
 * exactly mirroring the frontend `selectFilteredHotels` selector.
 */
export class HotelRepository extends MongoReadRepository<Hotel> implements IHotelRepository {
  constructor() {
    super(HotelModel);
  }

  async findFiltered(filter: HotelFilter): Promise<Hotel[]> {
    const query: Record<string, unknown> = {};

    if (filter.stars?.length) query.stars = { $in: filter.stars };
    if (filter.types?.length) query.type = { $in: filter.types };
    if (filter.amenities?.length) query.amenities = { $all: filter.amenities };
    if (filter.activities?.length) query.activities = { $all: filter.activities };
    if (filter.roomSizes?.length) query.roomSizes = { $all: filter.roomSizes };
    if (filter.views?.length) query.views = { $all: filter.views };
    if (filter.climate?.length) query.climate = { $all: filter.climate };
    if (typeof filter.maxPrice === 'number') query.price = { $lte: filter.maxPrice };

    return this.findAll(query);
  }
}
