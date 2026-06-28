import type { IReadRepository } from './IReadRepository';

/**
 * Adds writes on top of the read contract. Modules that mutate data (orders,
 * users) depend on this; pure catalog services depend only on IReadRepository.
 */
export interface IWriteRepository<T> extends IReadRepository<T> {
  create(data: Partial<T>): Promise<T>;
  updateById(id: string, data: Partial<T>): Promise<T | null>;
  deleteById(id: string): Promise<boolean>;
}
