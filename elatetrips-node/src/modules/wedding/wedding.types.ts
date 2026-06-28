/**
 * Wedding enquiry — captured when a traveller selects "Wedding" in the planner.
 * The journey diverts to a dedicated form and the lead is handed to an
 * engagement manager, so this is a high-touch enquiry rather than a self-serve
 * booking.
 */

export interface WeddingContact {
  name: string;
  phone: string;
  email: string;
}

/** A ceremony the couple is planning: its type and the date it falls on. */
export interface WeddingCeremony {
  type: string;
  date: string;
}

export interface WeddingEnquiry {
  referenceId: string;
  contact: WeddingContact;
  /** Guest-count band for the wedding itself (LOV value). */
  weddingGuests: string;
  /** Pre-wedding ceremonies (type + date), e.g. Mehendi, Sangeet. */
  preCeremonies: WeddingCeremony[];
  /** Post-wedding ceremonies (type + date), e.g. Reception. */
  postCeremonies: WeddingCeremony[];
  /** Services of interest: photoshoot, makeup, decor, catering, travel, … */
  services: string[];
  /** Preferred wedding date (ISO yyyy-mm-dd or free text). */
  weddingDate: string;
  /** Hotels the couple is considering. */
  preferredHotels: string;
  /** Trip context carried from the planner (e.g. destination). */
  destination: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

/** What a client submits — reference id and timestamps are server-assigned. */
export type CreateWeddingEnquiryInput = Omit<
  WeddingEnquiry,
  'referenceId' | 'createdAt' | 'updatedAt'
>;
