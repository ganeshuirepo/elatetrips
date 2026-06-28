/**
 * Read-only repository abstraction (Interface Segregation + Dependency
 * Inversion): services depend on this contract, not on Mongoose. Consumers that
 * only read reference data never see write methods.
 */
export interface IReadRepository<T> {
  findAll(filter?: Record<string, unknown>): Promise<T[]>;
  findOne(filter: Record<string, unknown>): Promise<T | null>;
  findById(id: string): Promise<T | null>;
  count(filter?: Record<string, unknown>): Promise<number>;
}
