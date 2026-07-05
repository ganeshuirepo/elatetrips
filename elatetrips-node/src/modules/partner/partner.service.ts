import { NotFoundError } from '../../common/errors/AppError';
import type { IPartnerRepository } from './partner.repository';
import type { PartnerEoi, CreatePartnerEoiInput } from './partner.types';

/**
 * Vendor EOI use cases. The form is public (no partner accounts yet), so
 * reads and updates prove ownership with the reference id + the registered
 * email. A single "not found" error covers both a wrong reference and a wrong
 * email, so the endpoint can't be used to probe which references exist.
 */
export class PartnerService {
  constructor(private readonly partners: IPartnerRepository) {}

  createEoi(input: CreatePartnerEoiInput): Promise<PartnerEoi> {
    return this.partners.create(input);
  }

  async getEoi(referenceId: string, email: string): Promise<PartnerEoi> {
    return this.findOwned(referenceId, email);
  }

  async updateEoi(
    referenceId: string,
    email: string,
    input: CreatePartnerEoiInput,
  ): Promise<PartnerEoi> {
    const existing = await this.findOwned(referenceId, email);
    // The track a vendor signed up under is fixed; edits refresh the content.
    const updated = await this.partners.updateByReferenceId(existing.referenceId, {
      ...input,
      partnerType: existing.partnerType,
    });
    if (!updated) throw notFound();
    return updated;
  }

  private async findOwned(referenceId: string, email: string): Promise<PartnerEoi> {
    const eoi = await this.partners.findByReferenceId(referenceId.trim().toUpperCase());
    if (!eoi || eoi.business.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
      throw notFound();
    }
    return eoi;
  }
}

const notFound = () =>
  new NotFoundError('No submission found for that reference ID and email.');
