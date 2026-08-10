/**
 * Mongoose model for the `console_users` collection — the login accounts behind
 * the admin/vendor dashboards (distinct from app users). A vendor row is bound
 * to exactly one catalog listing through vendorType + refId (see below); admin
 * rows leave those blank. username is unique + indexed so logins hit the index.
 */
import { Schema, model } from 'mongoose';

/**
 * Console accounts: Elate admins, onboarded listing vendors, and the
 * post-booking support roles — celebration crew vendors ('crew'), remote
 * Celebration Managers ('cm') and local Operational Managers ('om'). Support
 * roles bind to their support directory row through refId (staff or vendor id).
 */
export type ConsoleRole = 'admin' | 'vendor' | 'crew' | 'cm' | 'om';
/** What a vendor account is bound to — exactly one listing (or ground crew). */
export type VendorType = 'hotel' | 'cab' | 'experience' | 'ground';

export interface ConsoleUser {
  username: string;
  passwordHash: string;
  displayName: string;
  role: ConsoleRole;
  vendorType?: VendorType;
  /** Listing key: hotel id, vehicle id, or "kind:id" for an activity. */
  refId?: string;
  createdAt: string;
}

const consoleUserSchema = new Schema<ConsoleUser>(
  {
    username: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true },
    role: { type: String, required: true, index: true },
    vendorType: String,
    refId: String,
    createdAt: String,
  },
  { versionKey: false, collection: 'console_users' },
);

export const ConsoleUserModel = model<ConsoleUser>('ConsoleUser', consoleUserSchema);
