import type { IWeddingRepository } from './wedding.repository';
import type { WeddingEnquiry, CreateWeddingEnquiryInput } from './wedding.types';

/**
 * Wedding enquiry use cases. The form is public (the planner diverts here when
 * "Wedding" is chosen), so the service simply records the validated lead for the
 * engagement team to follow up.
 */
export class WeddingService {
  constructor(private readonly weddings: IWeddingRepository) {}

  createEnquiry(input: CreateWeddingEnquiryInput): Promise<WeddingEnquiry> {
    return this.weddings.create(input);
  }
}
