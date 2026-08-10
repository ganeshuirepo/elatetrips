/**
 * Post-booking support layer — the three roles behind the Elate Assistant chat
 * (see elatetrips-experiences/.claude/Elatetrips_PostBooking_Chatbot_Support_Plan.md):
 * the AI engine answers and cascades, the remote Celebration Manager (CM) takes
 * exceptions, the local Operational Manager (OM) fixes ground failures. Every
 * booking gets a milestone graph; vendors report against it; health is DERIVED
 * from windows and states rather than stored, so it can never go stale.
 */

export type StaffRole = 'cm' | 'om';

export interface SupportStaff {
  id: string;
  name: string;
  role: StaffRole;
  /** OMs own one city; CMs are deliberately remote (no city). */
  city?: string;
  phone: string;
  avatar: string; // emoji — stands in for a photo in the mock
  shift: string;
}

export type VendorCategory = 'decor' | 'cake' | 'flowers' | 'photo' | 'cab' | 'experience';

export interface SupportVendor {
  id: string;
  name: string;
  category: VendorCategory;
  city: string;
  rating: number; // 1–5, OM field judgment feeds this
  phone: string;
  /** Part of the OM's tested backup bench rather than the default assignment. */
  backup: boolean;
}

export type MilestoneState =
  | 'pending' // task assigned, vendor has not accepted yet
  | 'scheduled' // vendor accepted the window
  | 'enroute'
  | 'inprogress'
  | 'complete'
  | 'delayed';

/** Derived traffic-light health for one milestone (and, rolled up, a booking). */
export type Health = 'green' | 'amber' | 'red';

export interface Milestone {
  id: string;
  tripId: string;
  label: string;
  icon: string;
  category: VendorCategory;
  vendorId: string;
  state: MilestoneState;
  windowStart: string; // ISO
  windowEnd: string; // ISO
  /** Completion milestones need photo proof; the engine rejects a bare "done". */
  requiresPhoto: boolean;
  photoUrl?: string;
  /** 'pending' until the CM (standard tier) or the guest (premium) rules on it. */
  photoApproval?: 'pending' | 'approved' | 'change_requested';
  note?: string;
  updatedAt: string;
}

export type MessageFrom = 'user' | 'assistant' | 'cm' | 'om' | 'vendor';
export type MessageKind = 'chat' | 'status' | 'photo' | 'handoff';

export interface ThreadMessage {
  id: string;
  tripId: string;
  from: MessageFrom;
  kind: MessageKind;
  text: string;
  at: string;
  milestoneId?: string;
  /**
   * Coordination between crew and managers, never shown to the guest — the
   * calm stream is the product, and vendors never talk to guests directly
   * (§3.2: their fallback channel is the CM, who proxies).
   */
  internal?: boolean;
  /** Display name of the human who wrote it (CM/OM/vendor messages). */
  author?: string;
}

export type TicketState = 'open' | 'ack' | 'resolved';

export interface Ticket {
  id: string;
  tripId: string;
  /** 1 = CM (chase, review, comfort); 2 = OM (physical fix, replace vendor). */
  level: 1 | 2;
  state: TicketState;
  city: string;
  cause: string;
  openedAt: string;
  ownerId?: string;
  resolution?: string;
}

/** "Keep me posted on everything" vs "just handle it". Governs §5 thresholds. */
export type NotifyPref = 'everything' | 'handled';

export interface TripSupport {
  tripId: string;
  phone: string;
  cmId: string;
  omId: string;
  pref: NotifyPref;
  /** The celebration moment the graph counts down to. */
  eventAt: string;
  city: string;
  premium: boolean;
}
