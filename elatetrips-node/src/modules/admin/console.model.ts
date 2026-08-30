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
export const CONSOLE_ROLES = ['admin', 'vendor', 'crew', 'cm', 'om'] as const;
export type ConsoleRole = (typeof CONSOLE_ROLES)[number];

/** What a vendor account is bound to — exactly one listing (or ground crew). */
export const VENDOR_TYPES = ['hotel', 'cab', 'experience', 'ground'] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];

export interface ConsoleUser {
  username: string;
  passwordHash: string;
  displayName: string;
  role: ConsoleRole;
  vendorType?: VendorType;
  /** Listing key: hotel id, vehicle id, or "kind:id" for an activity. */
  refId?: string;
  /**
   * Supply-side partner this account speaks for — the `partner_id` the rate
   * card pipeline is keyed by. Distinct from refId on purpose: refId points at
   * ONE catalog listing, while a partner may hold rates across several.
   *
   * This is the binding that makes /partner/ratecard/:partnerId safe. Without
   * it the id in the URL would be the only thing naming the account, and the
   * page would open anyone's rates to anyone who could count.
   */
  partnerId?: string;
  createdAt: string;
}

const consoleUserSchema = new Schema<ConsoleUser>(
  {
    username: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true },
    // `role` decides which console a person reaches, so an unconstrained string
    // here is an authorization bug waiting for a typo: a row saved as 'Admin'
    // or 'ops' matches no guard and no switch, and fails in whichever direction
    // the reading code happens to default to.
    role: { type: String, required: true, enum: CONSOLE_ROLES, index: true },
    partnerId: { type: String, index: true },
    vendorType: { type: String, enum: VENDOR_TYPES },
    refId: String,
    createdAt: { type: String, required: true },
  },
  { versionKey: false, collection: 'console_users' },
);

export const ConsoleUserModel = model<ConsoleUser>('ConsoleUser', consoleUserSchema);
