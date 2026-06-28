import type { IPartnerRepository } from './partner.repository';
import type { PartnerEoi, CreatePartnerEoiInput } from './partner.types';

/**
 * Hotelier EOI use cases. The form is public (no account required), so the
 * service simply records the validated submission for the partnerships team.
 */
export class PartnerService {
  constructor(private readonly partners: IPartnerRepository) {}

  createEoi(input: CreatePartnerEoiInput): Promise<PartnerEoi> {
    return this.partners.create(input);
  }
}
