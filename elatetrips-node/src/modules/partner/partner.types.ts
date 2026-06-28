/**
 * Hotelier "Expression of Interest" — a prospective celebration partner's
 * submission. Mirrors the public EOI form: property + contact, the celebration
 * services they can offer, surprise-setup capability, and how they'll keep room
 * fares & availability current. Stored verbatim for the partnerships team.
 */

/** Property and primary contact. */
export interface PartnerProperty {
  hotelName: string;
  city: string;
  category: string;
  totalRooms: string;
  contactName: string;
  role: string;
  email: string;
  phone: string;
}

/** One celebration service the property is interested in offering. */
export interface PartnerServiceEntry {
  /** Catalogue key, e.g. "celebration_packages", "cab", "gifts". */
  service: string;
  /** Sub-options ticked for services that have them (e.g. decor packages). */
  packages?: string[];
  fulfilment: string;
  leadTime: string;
  priceRange: string;
  capacityPerDay: string;
  notes: string;
}

/** Ability to quietly execute a surprise in-room setup before arrival. */
export interface PartnerSurprise {
  capable: string;
  setupWindow: string;
  photoProof: string;
}

/** How the property keeps rates & availability up to date on ElateTrips. */
export interface PartnerInventory {
  updateMethod: string;
  channelManagerOrPMS: string;
  updateFrequency: string;
  liveAvailability: string;
  roomsAllocated: string;
  rateModel: string;
  confirmationSLA: string;
}

/** A stored EOI submission, identified by a human-friendly reference id. */
export interface PartnerEoi {
  referenceId: string;
  property: PartnerProperty;
  services: PartnerServiceEntry[];
  surprise: PartnerSurprise;
  inventory: PartnerInventory;
  notes: string;
  consent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** What a client submits — the reference id and timestamps are server-assigned. */
export type CreatePartnerEoiInput = Omit<PartnerEoi, 'referenceId' | 'createdAt' | 'updatedAt'>;
