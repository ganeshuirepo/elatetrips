/**
 * Post-booking support layer — the three roles behind the Elate Assistant chat
 * (see elatetrips-experiences/.claude/Elatetrips_PostBooking_Chatbot_Support_Plan.md):
 * the AI engine answers and cascades, the remote Celebration Manager (CM) takes
 * exceptions, the local Operational Manager (OM) fixes ground failures. Every
 * booking gets a milestone graph; vendors report against it; health is DERIVED
 * from windows and states rather than stored, so it can never go stale.
 */

/*
 * Every closed set below is declared ONCE, as a frozen array, and the TypeScript
 * union is derived from it. The array is what the Mongoose schema uses as its
 * `enum`, so the type the compiler checks and the values the database will
 * accept cannot drift apart — adding a member is one edit, and forgetting the
 * other half is no longer possible. Mirrors PARTNER_TYPES in partner.types.ts.
 */

export const STAFF_ROLES = ['cm', 'om'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

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

export const VENDOR_CATEGORIES = ['decor', 'cake', 'flowers', 'photo', 'cab', 'experience'] as const;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

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

export const MILESTONE_STATES = [
  'pending', // task assigned, vendor has not accepted yet
  'scheduled', // vendor accepted the window
  'enroute',
  'inprogress',
  'complete',
  'delayed',
] as const;
export type MilestoneState = (typeof MILESTONE_STATES)[number];

/** Derived traffic-light health for one milestone (and, rolled up, a booking). */
export const HEALTHS = ['green', 'amber', 'red'] as const;
export type Health = (typeof HEALTHS)[number];

/** Who rules on proof-of-completion: the CM (standard tier) or the guest (premium). */
export const PHOTO_APPROVALS = ['pending', 'approved', 'change_requested'] as const;
export type PhotoApproval = (typeof PHOTO_APPROVALS)[number];

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
  photoApproval?: PhotoApproval;
  note?: string;
  updatedAt: string;
}

export const MESSAGE_FROMS = ['user', 'assistant', 'cm', 'om', 'vendor'] as const;
export type MessageFrom = (typeof MESSAGE_FROMS)[number];

export const MESSAGE_KINDS = ['chat', 'status', 'photo', 'handoff'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

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

export const TICKET_STATES = ['open', 'ack', 'resolved'] as const;
export type TicketState = (typeof TICKET_STATES)[number];

/** 1 = CM (chase, review, comfort); 2 = OM (physical fix, replace vendor). */
export const TICKET_LEVELS = [1, 2] as const;
export type TicketLevel = (typeof TICKET_LEVELS)[number];

export interface Ticket {
  id: string;
  tripId: string;
  level: TicketLevel;
  state: TicketState;
  city: string;
  cause: string;
  openedAt: string;
  ownerId?: string;
  resolution?: string;
}

/** "Keep me posted on everything" vs "just handle it". Governs §5 thresholds. */
export const NOTIFY_PREFS = ['everything', 'handled'] as const;
export type NotifyPref = (typeof NOTIFY_PREFS)[number];

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
