import { PartnerEoiModel } from './partner.model';
import { nextSequence } from '../orders/counter.model';
import type { PartnerEoi, CreatePartnerEoiInput } from './partner.types';

/** Persistence contract for hotelier expressions of interest. */
export interface IPartnerRepository {
  /** Persist a new EOI, assigning a unique reference id. */
  create(input: CreatePartnerEoiInput): Promise<PartnerEoi>;
}

export class PartnerRepository implements IPartnerRepository {
  /** Build the next unique reference id, e.g. "EOI-100001". */
  private async nextReferenceId(): Promise<string> {
    const seq = await nextSequence('partner_eoi');
    return `EOI-${100000 + seq}`;
  }

  async create(input: CreatePartnerEoiInput): Promise<PartnerEoi> {
    const referenceId = await this.nextReferenceId();
    const doc = await PartnerEoiModel.create({ ...input, referenceId });
    return doc.toObject({ versionKey: false, transform: stripId });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function stripId(_doc: any, ret: any): any {
  delete ret._id;
  return ret;
}
