import { PartnerEoiModel } from './partner.model';
import { nextSequence } from '../orders/counter.model';
import type { PartnerEoi, CreatePartnerEoiInput } from './partner.types';

/** Persistence contract for vendor expressions of interest. */
export interface IPartnerRepository {
  /** Persist a new EOI, assigning a unique reference id. */
  create(input: CreatePartnerEoiInput): Promise<PartnerEoi>;
  /** Look up a submission by its reference id, or null. */
  findByReferenceId(referenceId: string): Promise<PartnerEoi | null>;
  /** Replace the editable content of a submission, or null if it vanished. */
  updateByReferenceId(referenceId: string, input: CreatePartnerEoiInput): Promise<PartnerEoi | null>;
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

  async findByReferenceId(referenceId: string): Promise<PartnerEoi | null> {
    const doc = await PartnerEoiModel.findOne({ referenceId });
    return doc ? doc.toObject({ versionKey: false, transform: stripId }) : null;
  }

  async updateByReferenceId(
    referenceId: string,
    input: CreatePartnerEoiInput,
  ): Promise<PartnerEoi | null> {
    const doc = await PartnerEoiModel.findOneAndUpdate(
      { referenceId },
      { $set: input },
      { new: true, runValidators: true },
    );
    return doc ? doc.toObject({ versionKey: false, transform: stripId }) : null;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function stripId(_doc: any, ret: any): any {
  delete ret._id;
  return ret;
}
