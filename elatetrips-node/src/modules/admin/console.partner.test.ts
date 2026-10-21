/**
 * Binding a console account to a supply partner.
 * Run: `npm test` (Node's own runner; see scripts/register-ts.js).
 *
 * `partnerId` is not a label — it is the thing partnerScopedGuard compares the
 * URL against, so it decides which rate card an account can open. That makes the
 * moment it is SET the only moment anyone is in a position to check it: an id
 * bound here that names no supplier hands out access to a rate card nobody owns,
 * and nothing downstream will ever question it.
 *
 * See console.guard.test.ts for the other half — what the guard does with the
 * binding once it exists.
 */
import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { AppError } from '../../common/errors/AppError';
import { StaticPartnerDirectory } from '../../common/ports/partnerDirectory';
import type { ConsoleUser } from './console.model';
import { ConsoleService, type ConsoleRepos } from './console.service';
import type { IPasswordHasher } from '../auth/auth.types';

const REAL = 'SUP-0001';
const NOT_REAL = 'SUP-9999';

/** The two operations bindPartner and createVendor actually perform. */
class FakeUserRepo {
  readonly rows: ConsoleUser[] = [];

  async findOne(filter: Record<string, unknown>): Promise<ConsoleUser | null> {
    return this.rows.find((r) => r.username === filter.username) ?? null;
  }

  async create(doc: Partial<ConsoleUser>): Promise<ConsoleUser> {
    const row = doc as ConsoleUser;
    this.rows.push(row);
    return row;
  }

  async updateOne(
    filter: Record<string, unknown>,
    patch: Partial<ConsoleUser>,
  ): Promise<ConsoleUser | null> {
    const i = this.rows.findIndex((r) => r.username === filter.username);
    if (i === -1) return null;
    this.rows[i] = { ...this.rows[i], ...patch };
    return this.rows[i];
  }
}

const hasher: IPasswordHasher = {
  hash: async (plain: string) => `hashed:${plain}`,
  compare: async (plain: string, hash: string) => hash === `hashed:${plain}`,
};

let users: FakeUserRepo;
let service: ConsoleService;

beforeEach(() => {
  users = new FakeUserRepo();
  // The catalog repositories are never reached by these paths — every account
  // here is 'ground', which by design has no listing to resolve. Cast once,
  // narrowly, rather than standing up four more doubles that nothing calls.
  const repos = { users } as unknown as ConsoleRepos;
  service = new ConsoleService(repos, hasher, new StaticPartnerDirectory([REAL]));
});

function account(over: Partial<ConsoleUser> = {}): ConsoleUser {
  return {
    username: 'crownvendor',
    passwordHash: 'hashed:x',
    displayName: 'Nilgiri Crown Resort',
    role: 'vendor',
    vendorType: 'ground',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as ConsoleUser;
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

describe('creating an account with a partner binding', () => {
  const newVendor = {
    username: 'crownvendor',
    password: 'Vendor@123',
    displayName: 'Nilgiri Crown Resort',
    vendorType: 'ground' as const,
  };

  it('accepts a partner that exists', async () => {
    await service.createVendor({ ...newVendor, partnerId: REAL });
    assert.equal(users.rows[0].partnerId, REAL);
  });

  it('refuses a partner that does not', async () => {
    const err = await caught(() => service.createVendor({ ...newVendor, partnerId: NOT_REAL }));
    assert.equal(err.statusCode, 404);
  });

  it('creates nothing when the binding is refused', async () => {
    // A half-created account with no binding would be worse than none: it holds
    // the username, so the corrected retry fails as "already taken".
    await caught(() => service.createVendor({ ...newVendor, partnerId: NOT_REAL }));
    assert.equal(users.rows.length, 0);
  });

  it('still allows an account with no binding at all', async () => {
    // Crew and listing-only vendors have no rate card; requiring a partner here
    // would break every account that legitimately has none.
    await service.createVendor(newVendor);
    assert.equal(users.rows.length, 1);
    assert.equal(users.rows[0].partnerId, undefined);
  });
});

describe('binding an account that already exists', () => {
  beforeEach(async () => {
    await users.create(account());
  });

  it('binds it, which is how an old account is repaired', async () => {
    const result = await service.bindPartner('crownvendor', REAL);
    assert.equal(result.partnerId, REAL);
    assert.equal(users.rows[0].partnerId, REAL);
  });

  it('is case-insensitive on the username, like login is', async () => {
    await service.bindPartner('CrownVendor', REAL);
    assert.equal(users.rows[0].partnerId, REAL);
  });

  it('refuses a partner that does not exist', async () => {
    const err = await caught(() => service.bindPartner('crownvendor', NOT_REAL));
    assert.equal(err.statusCode, 404);
    assert.equal(users.rows[0].partnerId, undefined);
  });

  it('refuses an account that does not exist', async () => {
    const err = await caught(() => service.bindPartner('nobody', REAL));
    assert.equal(err.statusCode, 404);
  });

  it('refuses to bind an ops account', async () => {
    // An admin already reaches every partner. A binding would imply a scoping
    // that does not apply, and would read as a restriction that is not there.
    await users.create(account({ username: 'admin', role: 'admin', vendorType: undefined }));
    const err = await caught(() => service.bindPartner('admin', REAL));
    assert.equal(err.statusCode, 400);
  });

  it('rebinds when a partner id is corrected', async () => {
    await service.bindPartner('crownvendor', REAL);
    const err = await caught(() => service.bindPartner('crownvendor', NOT_REAL));
    assert.equal(err.statusCode, 404);
    // The wrong id was refused, so the good one it already had must survive.
    assert.equal(users.rows[0].partnerId, REAL);
  });
});
