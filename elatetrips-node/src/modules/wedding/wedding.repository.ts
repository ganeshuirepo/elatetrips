import { WeddingEnquiryModel } from './wedding.model';
import { nextSequence } from '../orders/counter.model';
import type { WeddingEnquiry, CreateWeddingEnquiryInput } from './wedding.types';

/** Persistence contract for wedding enquiries. */
export interface IWeddingRepository {
  /** Persist a new enquiry, assigning a unique reference id. */
  create(input: CreateWeddingEnquiryInput): Promise<WeddingEnquiry>;
}

export class WeddingRepository implements IWeddingRepository {
  /** Build the next unique reference id, e.g. "WED-100001". */
  private async nextReferenceId(): Promise<string> {
    const seq = await nextSequence('wedding_enquiry');
    return `WED-${100000 + seq}`;
  }

  async create(input: CreateWeddingEnquiryInput): Promise<WeddingEnquiry> {
    const referenceId = await this.nextReferenceId();
    const doc = await WeddingEnquiryModel.create({ ...input, referenceId });
    return doc.toObject({ versionKey: false, transform: stripId });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function stripId(_doc: any, ret: any): any {
  delete ret._id;
  return ret;
}
