/**
 * What the DATABASE will refuse to store.
 * Run: `npm test` (Node's own runner; see scripts/register-ts.js).
 *
 * A TypeScript union is a promise the compiler keeps only about code it can
 * see. It says nothing about a document written by a migration script, an older
 * deploy, a mongosh session, or the other app that shares this database. The
 * schema is the only layer that is actually load-bearing for those, so every
 * closed set the code branches on is asserted here against the real Mongoose
 * validators.
 *
 * The values chosen as "bad" are the plausible ones — 'Admin' for 'admin',
 * 'in_progress' for 'inprogress' — because those are what a typo or a
 * well-meaning integration actually produces. They type-check nowhere, save
 * silently, and then fall through every switch that reads them.
 *
 * `validateSync()` runs the real schema — enums, min/max, match — without a
 * database, so these are fast and deterministic.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ConsoleUserModel } from '../../modules/admin/console.model';
import { PushTokenModel } from '../../modules/push/push.model';
import { SupplierModel } from '../../modules/supplier/supplier.model';
import { OrderModel } from '../../modules/orders/order.model';
import { UserModel } from '../../modules/users/user.model';
import { RefreshTokenModel } from '../../modules/auth/refresh.service';
import { RateRowModel, StagedProposalModel } from '../../modules/ratecard/ratecard.model';
import {
  MilestoneModel,
  SupportStaffModel,
  SupportVendorModel,
  ThreadMessageModel,
  TicketModel,
  TripSupportModel,
} from '../../modules/support/support.models';

/**
 * The one thing every model here has in common: you can construct it from a
 * plain object and ask it to validate. Their document types differ, so there is
 * no Mongoose generic that fits all of them — this names the shape actually
 * being used, and the single cast below is what buys every call site its
 * clean, untyped signature.
 */
type ValidatingModel = new (doc: Record<string, unknown>) => {
  validateSync(): { errors: Record<string, unknown> } | undefined;
};

/** The paths a document is invalid on, or [] when the schema accepts it. */
function invalidPaths(model: unknown, doc: Record<string, unknown>): string[] {
  const Ctor = model as ValidatingModel;
  const err = new Ctor(doc).validateSync();
  return err ? Object.keys(err.errors) : [];
}

/** Assert the schema accepts a document — guards against over-tightening. */
function accepts(model: unknown, doc: Record<string, unknown>, what: string): void {
  assert.deepEqual(invalidPaths(model, doc), [], `${what} should be accepted`);
}

/** Assert the schema rejects a document, naming the offending path. */
function rejects(model: unknown, doc: Record<string, unknown>, path: string): void {
  assert.ok(invalidPaths(model, doc).includes(path), `${path} should have been refused`);
}

// --- valid baselines --------------------------------------------------------

const consoleUser = {
  username: 'crownvendor',
  passwordHash: 'x',
  displayName: 'Nilgiri Crown Resort',
  role: 'vendor',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const pushToken = {
  token: 't',
  platform: 'android',
  scope: 'user',
  owner: '9876543210',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const supplier = {
  supplier_id: 'SUP-0001',
  type: 'hotel',
  name: 'Nilgiri Crown Resort',
  destinations: ['Ooty'],
  track: 'B',
  declared_tat_hours: 24,
  contract_accepted: false,
  status: 'invited',
};

const order = {
  tripId: 'T-1',
  phone: '9876543210',
  summary: { destination: 'Ooty', dates: '3N', travellers: '2 adults' },
};

const rateRow = {
  row_id: 'rc_1',
  partner_id: 'SUP-0001',
  destination: 'Goa',
  sku: 'DLX-BB-2P',
  price: { amount: 750_000, currency: 'INR' },
  effective_from: '2026-01-01',
  schema_version: 1,
  source: 'manual_upload',
  ingested_ts: '2026-01-01T00:00:00.000Z',
};

const milestone = {
  id: 'm1',
  tripId: 'T-1',
  label: 'Cake',
  icon: '🎂',
  category: 'cake',
  vendorId: 'v1',
  state: 'pending',
  windowStart: '2026-01-01T00:00:00.000Z',
  windowEnd: '2026-01-01T01:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const message = { id: 'x1', tripId: 'T-1', from: 'cm', kind: 'chat', text: 'hi', at: 'now' };
const ticket = { id: 'k1', tripId: 'T-1', level: 1, state: 'open', city: 'Ooty', cause: 'late', openedAt: 'now' };
const tripSupport = { tripId: 'T-1', phone: '9', cmId: 'c', omId: 'o', pref: 'handled', eventAt: 'n', city: 'Ooty' };
const staff = { id: 's1', name: 'A', role: 'cm', phone: '9', avatar: '🙂', shift: 'day' };
const supportVendor = { id: 'v1', name: 'Cakes', category: 'cake', city: 'Ooty', rating: 4, phone: '9' };

// --- who gets into which console -------------------------------------------

describe('console accounts', () => {
  it('accepts a real role', () => accepts(ConsoleUserModel, consoleUser, 'a vendor account'));

  it('refuses a role no guard would recognise', () => {
    // This is an authorization bug, not a cosmetic one: 'Admin' matches no
    // guard and no switch, so the account fails whichever way the code defaults.
    for (const role of ['Admin', 'superadmin', 'ops', '']) {
      rejects(ConsoleUserModel, { ...consoleUser, role }, 'role');
    }
  });

  it('refuses a vendor type that binds to no listing', () => {
    rejects(ConsoleUserModel, { ...consoleUser, vendorType: 'resort' }, 'vendorType');
  });

  it('still allows an account with no vendor type at all', () => {
    accepts(ConsoleUserModel, consoleUser, 'an admin with no listing binding');
  });
});

// --- delivery ---------------------------------------------------------------

describe('push tokens', () => {
  it('refuses a platform nothing can deliver to', () => {
    // Stored under 'Android' the row is simply never sent to, silently.
    for (const platform of ['Android', 'web', 'huawei']) {
      rejects(PushTokenModel, { ...pushToken, platform }, 'platform');
    }
  });

  it('refuses an audience that does not exist', () => {
    rejects(PushTokenModel, { ...pushToken, scope: 'admin' }, 'scope');
  });
});

// --- supply -----------------------------------------------------------------

describe('suppliers', () => {
  it('refuses an entity type outside the five', () => {
    // `type` decides the audit role and the candidate query, so a bad value
    // removes the supplier from broadcasts it should have been in.
    for (const type of ['resort', 'Hotel', 'agency']) {
      rejects(SupplierModel, { ...supplier, type }, 'type');
    }
  });

  it('refuses a contact role nothing routes to', () => {
    const doc = { ...supplier, contacts: [{ role: 'manager', name: 'A', otp_verified: false }] };
    rejects(SupplierModel, doc, 'contacts.0.role');
  });

  it('accepts each of the roles that do route', () => {
    for (const role of ['owner', 'quoter', 'banquet_sales', 'emergency']) {
      accepts(SupplierModel, { ...supplier, contacts: [{ role, name: 'A', otp_verified: true }] }, role);
    }
  });

  it('refuses a status outside the lifecycle', () => {
    rejects(SupplierModel, { ...supplier, status: 'onboarding' }, 'status');
  });
});

// --- money ------------------------------------------------------------------

describe('orders', () => {
  it('refuses a negative total', () => {
    // A refund is a cancellation, not a negative order — and a negative would
    // quietly subtract from every revenue sum that touches it.
    rejects(OrderModel, { ...order, total: -100 }, 'total');
  });

  it('refuses a negative discount', () => {
    rejects(OrderModel, { ...order, discount: -1 }, 'discount');
  });

  it('refuses a payment status that was never settled', () => {
    // Orders exist only after the gateway confirms, so 'pending' on a stored
    // order would describe a state this collection cannot be in.
    const doc = { ...order, payment: { method: 'upi', txnId: 't', status: 'pending' } };
    rejects(OrderModel, doc, 'payment.status');
  });

  it('refuses a status outside the two lifecycle states', () => {
    rejects(OrderModel, { ...order, status: 'refunded' }, 'status');
  });
});

// --- accounts ---------------------------------------------------------------

describe('users', () => {
  it('keeps the blank gender that predates the question', () => {
    // Storable, but not selectable — signup validates against GENDER_CHOICES.
    accepts(UserModel, { phone: '9876543210', gender: '' }, 'an account that never answered');
  });

  it('refuses a gender nothing renders', () => {
    rejects(UserModel, { phone: '9876543210', gender: 'M' }, 'gender');
  });

  it('refuses an impossible age', () => {
    // Age feeds the domain layer's age-gating rules, which would then gate on
    // nonsense rather than refusing it.
    for (const age of [-1, 500]) {
      rejects(UserModel, { phone: '9876543210', age }, 'age');
    }
  });
});

// --- rate cards -------------------------------------------------------------

describe('rate rows', () => {
  it('refuses a currency the platform does not price in', () => {
    rejects(RateRowModel, { ...rateRow, price: { amount: 1, currency: 'JPY' } }, 'price.currency');
  });

  it('refuses a negative price', () => {
    rejects(RateRowModel, { ...rateRow, price: { amount: -1, currency: 'INR' } }, 'price.amount');
  });

  it('refuses an unpadded date', () => {
    /* The effective-window query compares these as strings, so lexicographic
       order must equal chronological order. '2026-3-1' sorts AFTER '2026-12-01'
       and drops out of the window it belongs in — a missing price, not an
       error, which is the worst way for this to fail. */
    for (const effective_from of ['2026-3-1', '01-03-2026', '2026/03/01', 'March 2026']) {
      rejects(RateRowModel, { ...rateRow, effective_from }, 'effective_from');
    }
  });

  it('refuses an unpadded end date too', () => {
    rejects(RateRowModel, { ...rateRow, effective_to: '2026-6-3' }, 'effective_to');
  });

  it('accepts a well-formed row, open-ended or bounded', () => {
    accepts(RateRowModel, rateRow, 'an open-ended row');
    accepts(RateRowModel, { ...rateRow, effective_to: '2026-06-30' }, 'a bounded row');
  });

  it('refuses a source no adapter produces', () => {
    rejects(RateRowModel, { ...rateRow, source: 'import' }, 'source');
  });
});

describe('staged proposals', () => {
  const staged = {
    proposal_id: 'pr_1',
    partner_id: 'SUP-0001',
    destination: 'Goa',
    sku: 'DLX-BB-2P',
    incoming: { ...rateRow, cell: { sheet: 'Rates', row: 2 } },
    reason: 'beyond_band',
    tolerance: { decision: 'stage', within_band: false },
    drift: { breached: false },
    status: 'pending',
    created_ts: '2026-01-01T00:00:00.000Z',
  };

  it('refuses a review status outside the queue', () => {
    rejects(StagedProposalModel, { ...staged, status: 'escalated' }, 'status');
  });

  it('refuses a staging reason the engine never emits', () => {
    rejects(StagedProposalModel, { ...staged, reason: 'too_expensive' }, 'reason');
  });

  it('refuses a tolerance decision that is neither', () => {
    rejects(
      StagedProposalModel,
      { ...staged, tolerance: { decision: 'maybe', within_band: false } },
      'tolerance.decision',
    );
  });
});

// --- the support state machines --------------------------------------------

describe('support', () => {
  it('refuses a milestone state outside the machine', () => {
    // 'in_progress' for 'inprogress' is the exact typo an integration makes,
    // and it would sit in the graph matching no transition and no health rule.
    for (const state of ['in_progress', 'done', 'Pending']) {
      rejects(MilestoneModel, { ...milestone, state }, 'state');
    }
  });

  it('accepts every state the machine does use', () => {
    for (const state of ['pending', 'scheduled', 'enroute', 'inprogress', 'complete', 'delayed']) {
      accepts(MilestoneModel, { ...milestone, state }, state);
    }
  });

  it('refuses a photo-approval verdict nobody rules', () => {
    rejects(MilestoneModel, { ...milestone, photoApproval: 'rejected' }, 'photoApproval');
  });

  it('refuses a message sender that is not a party to the thread', () => {
    // `from` is what decides whether a message is shown to a guest.
    rejects(ThreadMessageModel, { ...message, from: 'system' }, 'from');
  });

  it('refuses a message kind nothing renders', () => {
    rejects(ThreadMessageModel, { ...message, kind: 'video' }, 'kind');
  });

  it('refuses a ticket escalation level nobody owns', () => {
    // 1 is the CM, 2 is the OM. A 3 belongs to no one and would sit unworked.
    rejects(TicketModel, { ...ticket, level: 3 }, 'level');
  });

  it('refuses a ticket state outside the lifecycle', () => {
    rejects(TicketModel, { ...ticket, state: 'closed' }, 'state');
  });

  it('refuses a notify preference the thresholds do not know', () => {
    rejects(TripSupportModel, { ...tripSupport, pref: 'none' }, 'pref');
  });

  it('refuses a staff role that is neither CM nor OM', () => {
    rejects(SupportStaffModel, { ...staff, role: 'admin' }, 'role');
  });

  it('refuses a vendor category nothing is assigned from', () => {
    rejects(SupportVendorModel, { ...supportVendor, category: 'catering' }, 'category');
  });

  it('refuses a rating off the 1–5 scale it is averaged on', () => {
    for (const rating of [0, 6]) {
      rejects(SupportVendorModel, { ...supportVendor, rating }, 'rating');
    }
  });
});

// --- what must not accumulate ----------------------------------------------

describe('refresh tokens', () => {
  it('expire themselves', () => {
    /* Every row is a credential, so this is the one collection that must not
       grow for the life of the deployment. Rotation deletes what it consumes;
       this catches the abandoned sessions, which are most of them. */
    const ttl = RefreshTokenModel.schema
      .indexes()
      .find(([keys]) => Object.prototype.hasOwnProperty.call(keys, 'expiresAt'));
    assert.ok(ttl, 'expected a TTL index on expiresAt');
    assert.equal(ttl?.[1]?.expireAfterSeconds, 0);
  });

  it('store expiry as a Date, because a TTL index cannot reap a string', () => {
    // The reason the index above was impossible before: Mongo's TTL monitor
    // ignores any value that is not a Date.
    assert.equal(RefreshTokenModel.schema.path('expiresAt').instance, 'Date');
  });
});
