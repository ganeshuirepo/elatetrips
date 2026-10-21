/**
 * Provisioning a supplier from a completed partner registration.
 * Run: `npm test` (Node's own runner; see scripts/register-ts.js).
 *
 * The property everything else rests on is IDEMPOTENCE. The caller is a web
 * request handler: it can be retried after a timeout, double-submitted, or run
 * twice by two processes at once. If any of those produce a second supplier for
 * one real company, that company ends up with two rate cards and two pool
 * memberships and no way to say which is authoritative — a data problem nobody
 * notices until a booking is priced from the wrong one.
 *
 * So `external_ref` — the onboarding system's own id for the same partner — is
 * the key, and these tests push on it from every angle a real deployment will.
 */
import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { AppError } from '../../common/errors/AppError';
import { SupplierAuditStore } from './supplier.audit';
import { loadSupplierConfig, type SupplierConfig } from './supplier.config';
import type { ISupplierRepository } from './supplier.repository';
import { SupplierService } from './supplier.service';
import type { ProvisionPartnerInput, Supplier } from './supplier.types';

/**
 * An in-memory stand-in for the Mongo repository, including the two behaviours
 * that matter here: a unique constraint on external_ref, and an atomic
 * sequence. Without the constraint the race test would prove nothing.
 */
class FakeSupplierRepository implements ISupplierRepository {
  readonly rows: Supplier[] = [];
  private seq = 0;
  /** Set to run inside create(), to interleave a competing write. */
  onCreate?: () => Promise<void>;

  async findBySupplierId(supplierId: string): Promise<Supplier | null> {
    return this.rows.find((r) => r.supplier_id === supplierId) ?? null;
  }

  async findByExternalRef(externalRef: string): Promise<Supplier | null> {
    return this.rows.find((r) => r.external_ref === externalRef) ?? null;
  }

  async nextSupplierId(): Promise<string> {
    this.seq += 1;
    return `SUP-${String(this.seq).padStart(4, '0')}`;
  }

  async create(doc: Partial<Supplier>): Promise<Supplier> {
    if (this.onCreate) {
      const hook = this.onCreate;
      this.onCreate = undefined;
      await hook();
    }
    const row = doc as Supplier;
    if (row.external_ref !== undefined && (await this.findByExternalRef(row.external_ref))) {
      // What the unique index does, phrased the way the driver phrases it.
      throw new Error('E11000 duplicate key error collection: suppliers index: external_ref_1');
    }
    this.rows.push(row);
    return row;
  }

  async update(supplierId: string, patch: Partial<Supplier>): Promise<Supplier | null> {
    const i = this.rows.findIndex((r) => r.supplier_id === supplierId);
    if (i === -1) return null;
    this.rows[i] = { ...this.rows[i], ...patch };
    return this.rows[i];
  }

  async findDirectory(): Promise<Supplier[]> {
    return this.rows;
  }

  async countInSlot(): Promise<number> {
    return 0;
  }

  async findCandidates(): Promise<Supplier[]> {
    return this.rows;
  }
}

let repo: FakeSupplierRepository;
let service: SupplierService;

function build(config: SupplierConfig = loadSupplierConfig({})): void {
  repo = new FakeSupplierRepository();
  service = new SupplierService(repo, config, new SupplierAuditStore());
}

beforeEach(() => build());

function input(over: Partial<ProvisionPartnerInput> = {}): ProvisionPartnerInput {
  return {
    external_ref: 'ET-TTF-001',
    type: 'hotel',
    name: 'Nilgiri Crown Resort',
    destinations: ['Ooty'],
    track: 'B',
    declared_tat_hours: 24,
    ...over,
  };
}

async function caught(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    assert.ok(err instanceof AppError, `expected an AppError, got ${String(err)}`);
    return err;
  }
  throw new Error('expected the call to be refused, but it succeeded');
}

describe('provisioning a partner for the first time', () => {
  it('mints the supplier id — the caller does not get to choose one', async () => {
    const result = await service.provisionForPartner(input());
    assert.equal(result.created, true);
    assert.equal(result.supplier.supplier_id, 'SUP-0001');
  });

  it('carries the registration through to the record', async () => {
    const result = await service.provisionForPartner(input());
    assert.equal(result.supplier.name, 'Nilgiri Crown Resort');
    assert.deepEqual(result.supplier.destinations, ['Ooty']);
    assert.equal(result.supplier.track, 'B');
    assert.equal(result.supplier.type, 'hotel');
  });

  it('starts invited, and unaccepted — provisioning is not activation', async () => {
    // The reason it is safe to provision the moment a form is submitted: the
    // vetting and activation gates (FR3.5/FR3.10) still stand in front of this
    // supplier, so nothing will be broadcast to it yet.
    await service.provisionForPartner(input());
    assert.equal(repo.rows[0].status, 'invited');
    assert.equal(repo.rows[0].contract_accepted, false);
  });

  it('keeps the onboarding system’s own id, which is what makes it findable again', async () => {
    await service.provisionForPartner(input());
    assert.equal(repo.rows[0].external_ref, 'ET-TTF-001');
  });

  it('gives each partner its own id', async () => {
    const a = await service.provisionForPartner(input({ external_ref: 'ET-TTF-001' }));
    const b = await service.provisionForPartner(input({ external_ref: 'ET-TTF-002' }));
    assert.notEqual(a.supplier.supplier_id, b.supplier.supplier_id);
    assert.equal(repo.rows.length, 2);
  });
});

describe('provisioning the same partner again', () => {
  it('returns the same supplier and says it did not create one', async () => {
    const first = await service.provisionForPartner(input());
    const second = await service.provisionForPartner(input());
    assert.equal(second.created, false);
    assert.equal(second.supplier.supplier_id, first.supplier.supplier_id);
    assert.equal(repo.rows.length, 1);
  });

  it('does not overwrite what ops has since curated', async () => {
    // A partner re-submitting their form must not silently revert destinations
    // or a track that ops corrected by hand. Amending a supplier is PATCH, an
    // explicit act by someone who meant it.
    await service.provisionForPartner(input());
    await service.update('SUP-0001', { destinations: ['Ooty', 'Coonoor'], track: 'A' });

    const again = await service.provisionForPartner(input({ destinations: ['Ooty'], track: 'B' }));
    assert.deepEqual(again.supplier.destinations, ['Ooty', 'Coonoor']);
    assert.equal(again.supplier.track, 'A');
  });

  it('survives two processes racing to create it', async () => {
    // Both read "not found", both try to insert, the unique index lets one win.
    // The loser must resolve to the winner's record — a partner who submitted a
    // form once should never see an error because we asked ourselves twice.
    repo.onCreate = async (): Promise<void> => {
      await repo.create({
        supplier_id: 'SUP-0099',
        external_ref: 'ET-TTF-001',
        type: 'hotel',
        name: 'Nilgiri Crown Resort',
        destinations: ['Ooty'],
        track: 'B',
        declared_tat_hours: 24,
        contract_accepted: false,
        status: 'invited',
      });
    };

    const result = await service.provisionForPartner(input());
    assert.equal(result.created, false);
    assert.equal(result.supplier.supplier_id, 'SUP-0099');
    assert.equal(repo.rows.length, 1);
  });

  it('re-throws a failure that is not a lost race', async () => {
    // A database that is simply down must surface as an error, not be swallowed
    // by the race handling and reported as a successful no-op.
    repo.create = async (): Promise<Supplier> => {
      throw new Error('connection refused');
    };
    await assert.rejects(() => service.provisionForPartner(input()), /connection refused/);
  });
});

describe('the turnaround a partner declares', () => {
  it('is refused below the configured platform floor', async () => {
    build(loadSupplierConfig({ SUPPLIER_TAT_FLOOR_HOURS: '2' }));
    const err = await caught(() => service.provisionForPartner(input({ declared_tat_hours: 1 })));
    assert.equal(err.statusCode, 422);
  });

  it('is accepted at the floor exactly', async () => {
    build(loadSupplierConfig({ SUPPLIER_TAT_FLOOR_HOURS: '2' }));
    const result = await service.provisionForPartner(input({ declared_tat_hours: 2 }));
    assert.equal(result.created, true);
  });

  it('is unconstrained when no floor is configured — the module ships inert (BR-17)', async () => {
    const result = await service.provisionForPartner(input({ declared_tat_hours: 1 }));
    assert.equal(result.created, true);
  });

  it('leaves nothing behind when it is refused', async () => {
    // A rejected provisioning must not consume an id or half-write a record.
    build(loadSupplierConfig({ SUPPLIER_TAT_FLOOR_HOURS: '2' }));
    await caught(() => service.provisionForPartner(input({ declared_tat_hours: 1 })));
    assert.equal(repo.rows.length, 0);
  });
});
