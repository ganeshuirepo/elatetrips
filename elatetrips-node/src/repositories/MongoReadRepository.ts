import type { Model } from 'mongoose';
import type { IReadRepository } from '../common/interfaces/IReadRepository';

/** Query surface shared with the CRUD subclass; model calls keep their receivers. */
interface RepositoryModel extends Pick<Model<unknown>, 'create' | 'findOneAndUpdate'> {
  find(filter: Record<string, unknown>): {
    select(projection: string): {
      lean<TResult>(): { exec(): Promise<TResult> };
    };
  };
  findOne(filter: Record<string, unknown>): {
    select(projection: string): {
      lean<TResult>(): { exec(): Promise<TResult | null> };
    };
  };
  countDocuments(filter: Record<string, unknown>): { exec(): Promise<number> };
}

/**
 * Generic, reusable read repository backed by a Mongoose model. Concrete
 * repositories either use this directly or extend it (Open/Closed) to add
 * specialised queries — see HotelRepository. Documents are returned `lean()` as
 * plain DTOs so the service/transport layers never touch Mongoose internals.
 */
export class MongoReadRepository<T> implements IReadRepository<T> {
  /** Hide Mongo bookkeeping so responses match the client DTO shape. */
  protected readonly projection = '-_id -__v';

  constructor(protected readonly model: RepositoryModel) {}

  async findAll(filter: Record<string, unknown> = {}): Promise<T[]> {
    return this.model.find(filter).select(this.projection).lean<T[]>().exec();
  }

  async findOne(filter: Record<string, unknown>): Promise<T | null> {
    return this.model.findOne(filter).select(this.projection).lean<T>().exec();
  }

  async findById(id: string): Promise<T | null> {
    // Looks up the domain `id` field, not Mongo's `_id`. Every collection here
    // carries a stable business id (e.g. "hotel-123") — that is what clients pass
    // and what the `-_id` projection exposes, so `_id` is never used for lookup.
    return this.model.findOne({ id }).select(this.projection).lean<T>().exec();
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }
}
