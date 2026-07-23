import { MongoReadRepository } from './MongoReadRepository';

/**
 * Read repository extended with the write operations the admin console needs.
 * Public catalog traffic stays on the read contract; only the admin module
 * receives this wider type (Interface Segregation kept at the container).
 */
export class MongoCrudRepository<T> extends MongoReadRepository<T> {
  async create(doc: Partial<T>): Promise<T> {
    const createdDoc = await this.model.create(doc);
    // create() yields a hydrated document, not a lean() result, so strip _id/__v
    // by hand to match the read repo's `-_id -__v` projection and the client DTO.
    const obj = createdDoc.toObject({ versionKey: false }) as Record<string, unknown>;
    delete obj._id;
    return obj as T;
  }

  async updateOne(filter: Record<string, unknown>, patch: Partial<T>): Promise<T | null> {
    // Partial patch via $set; `new: true` returns the post-update document, and
    // the inherited projection keeps its shape identical to reads.
    return this.model
      .findOneAndUpdate(filter, { $set: patch }, { new: true })
      .select(this.projection)
      .lean<T>()
      .exec();
  }
}
