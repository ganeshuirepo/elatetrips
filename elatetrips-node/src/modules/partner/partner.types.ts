/**
 * Vendor "Expression of Interest" — a prospective celebration partner's
 * submission. One template-driven form per partner track (hotels, transport,
 * on-ground services, adventure & wellness, local guides, gifting); the
 * track-specific answers arrive as a flat `details` record so new template
 * fields need no backend change. Stored verbatim for the partnerships team,
 * and editable by the vendor (reference id + registered email) so they can
 * keep their portfolio current.
 */

export const PARTNER_TYPES = [
  'hotel',
  'transport',
  'onground',
  'adventure',
  'guide',
  'gifting',
] as const;

export type PartnerType = (typeof PARTNER_TYPES)[number];

/** Business identity + primary contact, common to every partner track. */
export interface PartnerBusiness {
  businessName: string;
  city: string;
  contactName: string;
  role: string;
  email: string;
  phone: string;
}

/** One catalogue entry — a package, vehicle class, session, experience or SKU. */
export interface PortfolioItem {
  name: string;
  description: string;
  priceRange: string;
  link: string;
}

/** A stored EOI submission, identified by a human-friendly reference id. */
export interface PartnerEoi {
  referenceId: string;
  partnerType: PartnerType;
  business: PartnerBusiness;
  /** Template answers keyed by field, e.g. { surpriseCapable: "Yes, routinely" }. */
  details: Record<string, string | string[]>;
  portfolio: PortfolioItem[];
  notes: string;
  consent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** What a client submits — the reference id and timestamps are server-assigned. */
export type CreatePartnerEoiInput = Omit<PartnerEoi, 'referenceId' | 'createdAt' | 'updatedAt'>;
