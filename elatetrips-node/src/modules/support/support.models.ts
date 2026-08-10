import { Schema, model } from 'mongoose';
import type {
  Milestone,
  SupportStaff,
  SupportVendor,
  ThreadMessage,
  Ticket,
  TripSupport,
} from './support.types';

const opts = { versionKey: false, strict: true } as const;

const staffSchema = new Schema<SupportStaff>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    role: { type: String, required: true, index: true },
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
    category: { type: String, required: true, index: true },
    city: { type: String, required: true, index: true },
    rating: { type: Number, required: true },
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
    category: { type: String, required: true },
    vendorId: { type: String, required: true, index: true },
    state: { type: String, required: true },
    windowStart: { type: String, required: true },
    windowEnd: { type: String, required: true },
    requiresPhoto: { type: Boolean, default: false },
    photoUrl: String,
    photoApproval: String,
    note: String,
    updatedAt: { type: String, required: true },
  },
  opts,
);

const messageSchema = new Schema<ThreadMessage>(
  {
    id: { type: String, required: true, unique: true },
    tripId: { type: String, required: true, index: true },
    from: { type: String, required: true },
    kind: { type: String, required: true },
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
    level: { type: Number, required: true },
    state: { type: String, required: true, index: true },
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
    pref: { type: String, required: true },
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
