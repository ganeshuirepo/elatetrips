import type { Model } from 'mongoose';
import type { IReadRepository } from '../common/interfaces/IReadRepository';

/**
 * Generic, reusable read repository backed by a Mongoose model. Concrete
 * repositories either use this directly or extend it (Open/Closed) to add
 * specialised queries — see HotelRepository. Documents are returned `lean()` as
 * plain DTOs so the service/transport layers never touch Mongoose internals.
 */
export class MongoReadRepository<T> implements IReadRepository<T> {
  /** Hide Mongo bookkeeping so responses match the client DTO shape. */
  protected readonly projection = '-_id -__v';

  constructor(protected readonly model: Model<any>) {}

  async findAll(filter: Record<string, unknown> = {}): Promise<T[]> {
    return this.model.find(filter).select(this.projection).lean<T[]>().exec();
  }

  async findOne(filter: Record<string, unknown>): Promise<T | null> {
    return this.model.findOne(filter).select(this.projection).lean<T>().exec();
  }

  async findById(id: string): Promise<T | null> {
    return this.model.findOne({ id }).select(this.projection).lean<T>().exec();
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }
}
