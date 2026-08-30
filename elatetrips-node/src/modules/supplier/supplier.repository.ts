import { MongoCrudRepository } from '../../repositories/MongoCrudRepository';
import { nextSequence } from '../../common/db/counter';
import { SupplierModel } from './supplier.model';
import type { CandidateQuery, Supplier } from './supplier.types';

/**
 * Supplier repository contract (Dependency Inversion): the service depends on
 * this, never on Mongoose, so it is unit-testable with an in-memory fake. Read +
 * the writes onboarding needs, plus the two M3-specific queries — cap counting
 * and the candidate lookup.
 */
export interface ISupplierRepository {
  findBySupplierId(supplierId: string): Promise<Supplier | null>;
  create(doc: Partial<Supplier>): Promise<Supplier>;
  update(supplierId: string, patch: Partial<Supplier>): Promise<Supplier | null>;
  /** Directory listing (public contract view source). */
  findDirectory(filter: { destination?: string; track?: string }): Promise<Supplier[]>;
  /** Count active suppliers holding a cap slot in a destination (FR3.3). */
  countInSlot(destination: string, track: string, tier: string): Promise<number>;
  /** M5/M12 candidate query (FR3.8). */
  findCandidates(query: CandidateQuery): Promise<Supplier[]>;
  /** Look a partner up by the onboarding system's own id (idempotent provisioning). */
  findByExternalRef(externalRef: string): Promise<Supplier | null>;
  /**
   * Mint the next canonical supplier id. It lives on the repository because a
   * collision-free sequence IS persistence — the service must stay free of any
   * knowledge of how the number is allocated.
   */
  nextSupplierId(): Promise<string>;
}

/**
 * Mongoose-backed supplier repository. Extends the generic CRUD repository for
 * create/updateOne and specialises it (Open/Closed) with the directory, cap-count
 * and candidate queries. `findById` is overridden because the business key here
 * is `supplier_id`, not the generic `id` the base repository looks up.
 */
export class SupplierRepository
  extends MongoCrudRepository<Supplier>
  implements ISupplierRepository
{
  constructor() {
    super(SupplierModel);
  }

  findBySupplierId(supplierId: string): Promise<Supplier | null> {
    return this.findOne({ supplier_id: supplierId });
  }

  update(supplierId: string, patch: Partial<Supplier>): Promise<Supplier | null> {
    return this.updateOne({ supplier_id: supplierId }, patch);
  }

  findDirectory(filter: { destination?: string; track?: string }): Promise<Supplier[]> {
    const query: Record<string, unknown> = {};
    if (filter.destination) query.destinations = filter.destination;
    if (filter.track) query.track = filter.track;
    return this.findAll(query);
  }

  countInSlot(destination: string, track: string, tier: string): Promise<number> {
    return this.count({ destinations: destination, track, tier, status: 'active' });
  }

  findCandidates(query: CandidateQuery): Promise<Supplier[]> {
    const q: Record<string, unknown> = { destinations: query.destination };
    if (query.track) q.track = query.track;
    if (query.tier) q.tier = query.tier;
    if (query.status) q.status = query.status;
    return this.findAll(q);
  }

  findByExternalRef(externalRef: string): Promise<Supplier | null> {
    return this.findOne({ external_ref: externalRef });
  }

  async nextSupplierId(): Promise<string> {
    // Zero-padded to four so ids sort lexicographically for the first 9999
    // partners and stay the same width in a list. Past that it simply grows —
    // widening is a display concern, never a uniqueness one.
    const n = await nextSequence('supplier');
    return `SUP-${String(n).padStart(4, '0')}`;
  }
}
