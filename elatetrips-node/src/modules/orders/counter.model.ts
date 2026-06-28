import { Schema, model } from 'mongoose';

interface Counter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<Counter>(
  {
    _id: { type: String, required: true },
    // Starts at 0; the first $inc yields 1. Callers offset into a display range
    // (e.g. trip ids = 100000 + seq). MongoDB's $inc ignores schema defaults on
    // upsert, so the offset lives in the caller, not here.
    seq: { type: Number, default: 0 },
  },
  { versionKey: false },
);

export const CounterModel = model<Counter>('Counter', counterSchema);

/**
 * Atomically increments and returns the next value of a named counter. Backed by
 * a single `findOneAndUpdate($inc)` so concurrent bookings can never collide —
 * this is what guarantees globally-unique trip ids.
 */
export async function nextSequence(name: string): Promise<number> {
  const doc = await CounterModel.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
    .lean()
    .exec();
  return doc!.seq;
}
