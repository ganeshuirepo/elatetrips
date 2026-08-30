import { Schema, model } from 'mongoose';
import {
  MESSAGE_FROMS,
  MESSAGE_KINDS,
  MILESTONE_STATES,
  NOTIFY_PREFS,
  PHOTO_APPROVALS,
  STAFF_ROLES,
  TICKET_LEVELS,
  TICKET_STATES,
  VENDOR_CATEGORIES,
} from './support.types';
import type {
  Milestone,
  SupportStaff,
  SupportVendor,
  ThreadMessage,
  Ticket,
  TripSupport,
} from './support.types';

/*
 * Every closed set here is the SAME array the TypeScript union is derived from
 * (support.types.ts), so the values the compiler allows and the values the
 * database accepts are one definition rather than two that agree today.
 *
 * These matter more than most enums: `state` is a milestone state machine,
 * `from` decides whether a message is shown to a guest or kept internal, and
 * `role` decides which console a person reaches. An unconstrained string in any
 * of them is a write that type-checks, saves, and then falls through every
 * switch that reads it.
 *
 * Note this validates WRITES only — documents already stored with a value
 * outside the set still read back unchanged, so adding these cannot break an
 * existing row.
 *
 * `Health` has no column here on purpose: it is DERIVED from windows and states
 * on read, so it can never go stale, and storing it would be the bug.
 */

const opts = { versionKey: false, strict: true } as const;

const staffSchema = new Schema<SupportStaff>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    role: { type: String, required: true, enum: STAFF_ROLES, index: true },
    city: String,
    phone: { type: String, required: true },
    avatar: { type: String, required: true },
    shift: { type: String, required: true },
  },
  opts,
);

const vendorSchema = new Schema<SupportVendor>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, required: true, enum: VENDOR_CATEGORIES, index: true },
    city: { type: String, required: true, index: true },
    // 1–5. Bounded because OM field judgment feeds it by hand, and an unbounded
    // rating silently skews every ranking that averages it.
    rating: { type: Number, required: true, min: 1, max: 5 },
    phone: { type: String, required: true },
    backup: { type: Boolean, default: false },
  },
  opts,
);

const milestoneSchema = new Schema<Milestone>(
  {
    id: { type: String, required: true, unique: true },
    tripId: { type: String, required: true, index: true },
    label: { type: String, required: true },
    icon: { type: String, required: true },
    category: { type: String, required: true, enum: VENDOR_CATEGORIES },
    vendorId: { type: String, required: true, index: true },
    state: { type: String, required: true, enum: MILESTONE_STATES },
    windowStart: { type: String, required: true },
    windowEnd: { type: String, required: true },
    requiresPhoto: { type: Boolean, default: false },
    photoUrl: String,
    photoApproval: { type: String, enum: PHOTO_APPROVALS },
    note: String,
    updatedAt: { type: String, required: true },
  },
  opts,
);

const messageSchema = new Schema<ThreadMessage>(
  {
    id: { type: String, required: true, unique: true },
    tripId: { type: String, required: true, index: true },
    from: { type: String, required: true, enum: MESSAGE_FROMS },
    kind: { type: String, required: true, enum: MESSAGE_KINDS },
    text: { type: String, required: true },
    at: { type: String, required: true },
    milestoneId: String,
    internal: { type: Boolean, default: false, index: true },
    author: String,
  },
  opts,
);

const ticketSchema = new Schema<Ticket>(
  {
    id: { type: String, required: true, unique: true },
    tripId: { type: String, required: true, index: true },
    level: { type: Number, required: true, enum: TICKET_LEVELS },
    state: { type: String, required: true, enum: TICKET_STATES, index: true },
    city: { type: String, required: true, index: true },
    cause: { type: String, required: true },
    openedAt: { type: String, required: true },
    ownerId: String,
    resolution: String,
  },
  opts,
);

const tripSupportSchema = new Schema<TripSupport>(
  {
    tripId: { type: String, required: true, unique: true },
    phone: { type: String, required: true, index: true },
    cmId: { type: String, required: true },
    omId: { type: String, required: true },
    pref: { type: String, required: true, enum: NOTIFY_PREFS },
    eventAt: { type: String, required: true },
    city: { type: String, required: true },
    premium: { type: Boolean, default: false },
  },
  opts,
);

export const SupportStaffModel = model<SupportStaff>('SupportStaff', staffSchema, 'supportStaff');
export const SupportVendorModel = model<SupportVendor>('SupportVendor', vendorSchema, 'supportVendors');
export const MilestoneModel = model<Milestone>('SupportMilestone', milestoneSchema, 'supportMilestones');
export const ThreadMessageModel = model<ThreadMessage>('SupportMessage', messageSchema, 'supportMessages');
export const TicketModel = model<Ticket>('SupportTicket', ticketSchema, 'supportTickets');
export const TripSupportModel = model<TripSupport>('TripSupport', tripSupportSchema, 'supportTrips');
