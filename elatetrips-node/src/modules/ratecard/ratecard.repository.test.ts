/**
 * The rate-row repository contract, run against BOTH implementations.
 * Run: `npm test` (Node's own runner; see scripts/register-ts.js).
 *
 * These are written once and executed twice — in-memory and Mongo — because the
 * container swaps one for the other and RateCardService must not be able to tell
 * the difference. A rule that holds for the fake and not the real store is a bug
 * that only ever shows up in production, which is precisely where rate rows
 * matter: a booking snapshots the live rate for a SKU and is priced from it.
 *
 * The Mongo arm runs against an ephemeral in-process mongod, so it exercises
 * real queries, real indexes and real BSON round-tripping — never a live
 * database.
 */
import { strict as assert } from 'node:assert';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { InMemoryRateRowRepository, type IRateRowRepository } from './ratecard.repository';
import { MongoRateRowRepository } from './ratecard.repository.mongo';
import { RateRowModel, StagedProposalModel } from './ratecard.model';
import type { NormalizedRow, RateRow, StagedProposal } from './ratecard.types';

// --- fixtures ---------------------------------------------------------------

let seq = 0;

function row(over: Partial<RateRow> = {}): RateRow {
  seq += 1;
  return {
    row_id: `rc_${seq}`,
    partner_id: 'sup-001',
    destination: 'Goa',
    sku: 'DLX-BB-2P',
    price: { amount: 750_000, currency: 'INR' },
    effective_from: '2026-01-01',
    schema_version: 1,
    source: 'manual_upload',
    ingested_ts: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function incoming(over: Partial<NormalizedRow> = {}): NormalizedRow {
  return {
    partner_id: 'sup-001',
    destination: 'Goa',
    sku: 'DLX-BB-2P',
    price: { amount: 900_000, currency: 'INR' },
    effective_from: '2026-01-01',
    schema_version: 1,
    cell: { sheet: 'Rates', row: 4 },
    ...over,
  };
}

function proposal(over: Partial<StagedProposal> = {}): StagedProposal {
  seq += 1;
  return {
    proposal_id: `pr_${seq}`,
    partner_id: 'sup-001',
    destination: 'Goa',
    sku: 'DLX-BB-2P',
    incoming: incoming(),
    reason: 'beyond_band',
    tolerance: {
      decision: 'stage',
      within_band: false,
      band: { baseline_minor: 750_000, slab_pct: 5, lower_minor: 712_500, upper_minor: 787_500 },
      delta_pct: 20,
    },
    drift: { breached: false },
    status: 'pending',
    created_ts: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

// --- the contract -----------------------------------------------------------

function contract(name: string, makeRepo: () => IRateRowRepository): void {
  describe(name, () => {
    let repo: IRateRowRepository;
    beforeEach(() => {
      repo = makeRepo();
    });

    describe('the applied ledger', () => {
      it('round-trips a row, optional fields and all', async () => {
        const full = row({
          effective_to: '2026-06-30',
          supersedes_row_id: 'rc_older',
          cell: { sheet: 'Rates', row: 7 },
        });
        await repo.append(full);
        assert.deepEqual(await repo.getRow(full.row_id), full);
      });

      it('leaves an absent end date absent rather than null', async () => {
        // Downstream reads `effective_to === undefined` to mean open-ended.
        const open = row();
        await repo.append(open);
        const found = await repo.getRow(open.row_id);
        assert.equal(found?.effective_to, undefined);
      });

      it('returns a frozen row — the ledger is append-only', async () => {
        const saved = await repo.append(row());
        assert.ok(Object.isFrozen(saved));
        assert.ok(Object.isFrozen(saved.price));
      });

      it('has nothing to say about a row that was never appended', async () => {
        assert.equal(await repo.getRow('rc_nope'), undefined);
      });

      it('orders a SKU chronologically by ingestion', async () => {
        const later = row({ ingested_ts: '2026-03-01T00:00:00.000Z' });
        const earlier = row({ ingested_ts: '2026-02-01T00:00:00.000Z' });
        await repo.append(later);
        await repo.append(earlier);
        const all = await repo.appliedForSku('sup-001', 'DLX-BB-2P');
        assert.deepEqual(
          all.map((r) => r.row_id),
          [earlier.row_id, later.row_id],
        );
      });

      it('takes the newest row as the live baseline', async () => {
        await repo.append(row({ ingested_ts: '2026-02-01T00:00:00.000Z' }));
        const newest = row({
          ingested_ts: '2026-03-01T00:00:00.000Z',
          price: { amount: 800_000, currency: 'INR' },
        });
        await repo.append(newest);
        assert.equal((await repo.latestApplied('sup-001', 'DLX-BB-2P'))?.row_id, newest.row_id);
      });

      it('breaks a same-millisecond tie on insertion order', async () => {
        // A single ingest batch stamps every row with the same timestamp, and
        // the last one appended is the price that goes live. Without a stable
        // tiebreaker the live rate for a SKU is whichever row the storage engine
        // happened to return first — a silently wrong price, not an error.
        const ts = '2026-02-01T00:00:00.000Z';
        await repo.append(row({ ingested_ts: ts, price: { amount: 700_000, currency: 'INR' } }));
        const last = row({ ingested_ts: ts, price: { amount: 900_000, currency: 'INR' } });
        await repo.append(last);
        const live = await repo.latestApplied('sup-001', 'DLX-BB-2P');
        assert.equal(live?.row_id, last.row_id);
        assert.equal(live?.price.amount, 900_000);
      });

      it('never bleeds one partner rows into another', async () => {
        await repo.append(row({ partner_id: 'sup-002' }));
        assert.deepEqual(await repo.appliedForSku('sup-001', 'DLX-BB-2P'), []);
        assert.equal(await repo.latestApplied('sup-001', 'DLX-BB-2P'), undefined);
      });

      it('keeps SKUs apart', async () => {
        await repo.append(row({ sku: 'SUITE-AP-2P' }));
        assert.equal(await repo.latestApplied('sup-001', 'DLX-BB-2P'), undefined);
      });
    });

    describe('the rate effective on a date — what a booking snapshots', () => {
      it('picks the row whose window contains the date', async () => {
        const winter = row({ effective_from: '2026-01-01', effective_to: '2026-03-31' });
        const summer = row({
          effective_from: '2026-04-01',
          effective_to: '2026-09-30',
          ingested_ts: '2026-01-02T00:00:00.000Z',
        });
        await repo.append(winter);
        await repo.append(summer);
        assert.equal(
          (await repo.rateEffectiveAt('sup-001', 'DLX-BB-2P', '2026-02-14'))?.row_id,
          winter.row_id,
        );
        assert.equal(
          (await repo.rateEffectiveAt('sup-001', 'DLX-BB-2P', '2026-05-14'))?.row_id,
          summer.row_id,
        );
      });

      it('treats an open-ended row as running forever', async () => {
        const open = row({ effective_from: '2026-01-01' });
        await repo.append(open);
        assert.equal(
          (await repo.rateEffectiveAt('sup-001', 'DLX-BB-2P', '2031-12-31'))?.row_id,
          open.row_id,
        );
      });

      it('includes both edges of the window', async () => {
        const r = row({ effective_from: '2026-01-01', effective_to: '2026-01-31' });
        await repo.append(r);
        for (const on of ['2026-01-01', '2026-01-31']) {
          assert.equal((await repo.rateEffectiveAt('sup-001', 'DLX-BB-2P', on))?.row_id, r.row_id, on);
        }
      });

      it('excludes a date outside the window entirely', async () => {
        await repo.append(row({ effective_from: '2026-01-01', effective_to: '2026-01-31' }));
        assert.equal(await repo.rateEffectiveAt('sup-001', 'DLX-BB-2P', '2025-12-31'), undefined);
        assert.equal(await repo.rateEffectiveAt('sup-001', 'DLX-BB-2P', '2026-02-01'), undefined);
      });

      it('lets a later correction supersede an overlapping earlier row', async () => {
        // The whole reason the ledger is append-only: a fix is a new row.
        await repo.append(row({ ingested_ts: '2026-01-01T00:00:00.000Z' }));
        const fix = row({
          ingested_ts: '2026-01-05T00:00:00.000Z',
          price: { amount: 810_000, currency: 'INR' },
        });
        await repo.append(fix);
        assert.equal(
          (await repo.rateEffectiveAt('sup-001', 'DLX-BB-2P', '2026-02-01'))?.row_id,
          fix.row_id,
        );
      });
    });

    describe('freshness', () => {
      it('reads the newest row across every SKU', async () => {
        await repo.append(row({ sku: 'A', ingested_ts: '2026-01-01T00:00:00.000Z' }));
        const newest = row({ sku: 'B', ingested_ts: '2026-05-01T00:00:00.000Z' });
        await repo.append(newest);
        assert.equal((await repo.lastFreshRow('sup-001'))?.row_id, newest.row_id);
      });

      it('reports nothing for a partner that has never submitted', async () => {
        assert.equal(await repo.lastFreshRow('sup-unknown'), undefined);
      });
    });

    describe('the staged review queue', () => {
      it('round-trips a proposal with its tolerance and drift intact', async () => {
        const p = proposal();
        await repo.addStaged(p);
        assert.deepEqual(await repo.getStaged(p.proposal_id), p);
      });

      it('keeps a null band as null — "no baseline" is not "not written"', async () => {
        const p = proposal({
          tolerance: { decision: 'stage', within_band: false, band: null, delta_pct: null },
        });
        await repo.addStaged(p);
        const found = await repo.getStaged(p.proposal_id);
        assert.equal(found?.tolerance.band, null);
        assert.equal(found?.tolerance.delta_pct, null);
      });

      it('resolves a proposal without touching the others', async () => {
        const a = proposal();
        const b = proposal();
        await repo.addStaged(a);
        await repo.addStaged(b);
        await repo.updateStaged({
          ...a,
          status: 'approved',
          resolved_ts: '2026-02-01T00:00:00.000Z',
          resolved_by: 'ops-1',
        });
        assert.equal((await repo.getStaged(a.proposal_id))?.status, 'approved');
        assert.equal((await repo.getStaged(a.proposal_id))?.resolved_by, 'ops-1');
        assert.equal((await repo.getStaged(b.proposal_id))?.status, 'pending');
      });

      it('filters by partner, sku and status', async () => {
        const mine = proposal();
        await repo.addStaged(mine);
        await repo.addStaged(proposal({ partner_id: 'sup-002' }));
        await repo.addStaged(proposal({ sku: 'OTHER' }));
        await repo.addStaged(proposal({ status: 'rejected' }));

        assert.deepEqual(
          (
            await repo.listStaged({ partner_id: 'sup-001', sku: 'DLX-BB-2P', status: 'pending' })
          ).map((p) => p.proposal_id),
          [mine.proposal_id],
        );
        assert.equal((await repo.listStaged({ partner_id: 'sup-002' })).length, 1);
        assert.equal((await repo.listStaged({ status: 'rejected' })).length, 1);
        assert.equal((await repo.listStaged({})).length, 4);
      });

      it('has nothing to say about a proposal that was never staged', async () => {
        assert.equal(await repo.getStaged('pr_nope'), undefined);
      });
    });
  });
}

contract('in-memory rate rows', () => new InMemoryRateRowRepository());

describe('mongo-backed rate rows', () => {
  let mongod: MongoMemoryServer;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([RateRowModel.deleteMany({}), StagedProposalModel.deleteMany({})]);
  });

  contract('behaves like the contract says', () => new MongoRateRowRepository());
});
