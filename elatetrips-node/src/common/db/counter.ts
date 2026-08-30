/**
 * Monotonic counters, one document per named sequence.
 *
 * `findByIdAndUpdate` with `$inc` and `upsert` is a single atomic operation in
 * MongoDB, so two requests racing for the next number get two different numbers
 * — which is the whole reason this exists rather than a read-then-write in the
 * service. The alternative (random ids) would also be unique, but a supply
 * partner id is read aloud, pasted into a URL and quoted in email, so an ordered
 * human-sized id is worth a round trip.
 *
 * The collection is `ElateCounters`, shared with the partner portal's own
 * `vendorLead` sequence — one counter collection, one document per sequence.
 */
import { Schema, model } from 'mongoose';

interface CounterDoc {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<CounterDoc>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false },
);

export const CounterModel = model<CounterDoc>('ElateCounter', counterSchema, 'ElateCounters');

/** The next value of a named sequence, starting at 1. */
export async function nextSequence(name: string): Promise<number> {
  const doc = await CounterModel.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  )
    .lean<CounterDoc>()
    .exec();
  // `new: true` with `upsert: true` always returns a document; the fallback only
  // satisfies the type, and 1 is what a fresh sequence would have yielded.
  return doc?.seq ?? 1;
}
