/**
 * Mongoose-backed IRateRowRepository — the durable half of M17.
 *
 * This is a drop-in for InMemoryRateRowRepository: same interface, same return
 * shapes, same ordering rules, so RateCardService cannot tell them apart. The
 * in-memory one stays for unit tests; this one is what the container wires, so
 * a partner's submitted rates survive a restart.
 *
 * Two ordering details are load-bearing and easy to get wrong:
 *
 *  - `ingested_ts` is an ISO string, so lexicographic order IS chronological
 *    order — the same comparison the in-memory implementation makes. No date
 *    parsing, and none needed.
 *  - A single ingest batch can stamp several rows with the SAME millisecond, and
 *    "the latest applied row" then decides the live price. Every ordered query
 *    therefore breaks the tie on `_id`, whose counter is monotonic within the
 *    inserting process — preserving the insertion order the in-memory array got
 *    for free. Without it the live rate for a SKU would be arbitrary within a
 *    batch.
 *
 * `_id`/`__v` are projected away so callers receive the exact domain types.
 * Sorting happens before projection, so dropping `_id` costs nothing above.
 */
import type { FilterQuery } from 'mongoose';
import { RateRowModel, StagedProposalModel } from './ratecard.model';
import type { IRateRowRepository, StagedFilter } from './ratecard.repository';
import type { RateRow, StagedProposal } from './ratecard.types';

const PROJECTION = '-_id -__v';

/** Oldest first, then insertion order within a shared millisecond. */
const CHRONOLOGICAL = { ingested_ts: 1, _id: 1 } as const;
/** Newest first — the same order reversed, so "latest" is a limit(1). */
const NEWEST_FIRST = { ingested_ts: -1, _id: -1 } as const;

export class MongoRateRowRepository implements IRateRowRepository {
  // --- applied ledger (append-only) ---

  async append(row: RateRow): Promise<RateRow> {
    await RateRowModel.create(row);
    // The stored document IS `row` — the schema declares no defaults and adds
    // nothing, so echoing the input avoids a needless read-back and a cast.
    // Frozen for the same reason the in-memory store freezes: the append-only
    // invariant is enforced at runtime, not just by convention.
    return Object.freeze({ ...row, price: Object.freeze({ ...row.price }) });
  }

  async getRow(row_id: string): Promise<RateRow | undefined> {
    const row = await RateRowModel.findOne({ row_id }).select(PROJECTION).lean<RateRow>().exec();
    return row ?? undefined;
  }

  async appliedForSku(partner_id: string, sku: string): Promise<RateRow[]> {
    return RateRowModel.find({ partner_id, sku })
      .sort(CHRONOLOGICAL)
      .select(PROJECTION)
      .lean<RateRow[]>()
      .exec();
  }

  async latestApplied(partner_id: string, sku: string): Promise<RateRow | undefined> {
    return this.newest({ partner_id, sku });
  }

  async rateEffectiveAt(partner_id: string, sku: string, on: string): Promise<RateRow | undefined> {
    // The row whose effective window contains `on`. `{ effective_to: null }`
    // matches both an explicit null and a missing key, which is exactly the
    // open-ended row the in-memory version expresses as `=== undefined`.
    return this.newest({
      partner_id,
      sku,
      effective_from: { $lte: on },
      $or: [{ effective_to: null }, { effective_to: { $gte: on } }],
    });
  }

  async lastFreshRow(partner_id: string): Promise<RateRow | undefined> {
    return this.newest({ partner_id });
  }

  /** The most recently ingested row matching a filter — the shared read. */
  private async newest(filter: FilterQuery<RateRow>): Promise<RateRow | undefined> {
    const row = await RateRowModel.findOne(filter)
      .sort(NEWEST_FIRST)
      .select(PROJECTION)
      .lean<RateRow>()
      .exec();
    return row ?? undefined;
  }

  // --- staged proposals (review queue) ---

  async addStaged(proposal: StagedProposal): Promise<StagedProposal> {
    await StagedProposalModel.create(proposal);
    return proposal;
  }

  async getStaged(proposal_id: string): Promise<StagedProposal | undefined> {
    const found = await StagedProposalModel.findOne({ proposal_id })
      .select(PROJECTION)
      .lean<StagedProposal>()
      .exec();
    return found ?? undefined;
  }

  async listStaged(filter: StagedFilter): Promise<StagedProposal[]> {
    const query: FilterQuery<StagedProposal> = {};
    if (filter.partner_id) query.partner_id = filter.partner_id;
    if (filter.sku) query.sku = filter.sku;
    if (filter.status) query.status = filter.status;
    return StagedProposalModel.find(query)
      .sort({ created_ts: 1, _id: 1 })
      .select(PROJECTION)
      .lean<StagedProposal[]>()
      .exec();
  }

  async updateStaged(proposal: StagedProposal): Promise<StagedProposal> {
    // Whole-document write, matching the in-memory Map.set it replaces: the
    // service hands back a proposal it just read and mutated. Upsert keeps that
    // equivalence exact rather than failing on a proposal the queue has lost.
    await StagedProposalModel.findOneAndUpdate(
      { proposal_id: proposal.proposal_id },
      { $set: proposal },
      { upsert: true },
    ).exec();
    return proposal;
  }
}
