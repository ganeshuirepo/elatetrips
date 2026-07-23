import type { IReadRepository } from './IReadRepository';

/**
 * The generic write contract: read access plus create/update/delete, for
 * collections that need mutation. Pure catalog services depend only on
 * IReadRepository, so they can never mutate reference data (Interface
 * Segregation). Concrete writers vary in practice — the admin console's
 * MongoCrudRepository exposes its own create/updateOne surface, and domain
 * modules (orders, users) declare their own narrower persistence contracts — so
 * this stands as the canonical shape a writable repository should offer rather
 * than an interface implemented verbatim today.
 */
export interface IWriteRepository<T> extends IReadRepository<T> {
  create(data: Partial<T>): Promise<T>;
  updateById(id: string, data: Partial<T>): Promise<T | null>;
  deleteById(id: string): Promise<boolean>;
}
