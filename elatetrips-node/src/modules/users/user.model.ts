import { Schema, model } from 'mongoose';
import { ACCOUNT_STATUSES, GENDERS } from './user.types';
import type { UserWithSecret } from './user.types';

const billingSchema = new Schema(
  {
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    pin: { type: String, default: '' },
    gst: { type: String, default: '' },
  },
  { _id: false },
);

const userSchema = new Schema<UserWithSecret>(
  {
    phone: { type: String, required: true, unique: true, index: true },
    // Sparse so multiple accounts without an email don't collide on `null`.
    email: { type: String, default: '', index: true, sparse: true },
    name: { type: String, default: '' },
    gender: { type: String, enum: GENDERS, default: '' },
    // A stored age outside this range is a typo or a bot, and it feeds the
    // age-gating rules in the domain layer — which would then gate on nonsense.
    age: { type: Number, default: null, min: 0, max: 120 },
    // Excluded from queries unless explicitly selected with '+passwordHash'.
    passwordHash: { type: String, select: false },
    emailVerified: { type: Boolean, default: false },
    mobileVerified: { type: Boolean, default: false },
    status: { type: String, enum: ACCOUNT_STATUSES, default: 'active', index: true },
    billing: { type: billingSchema, default: undefined },
  },
  { timestamps: true, versionKey: false },
);

export const UserModel = model<UserWithSecret>('User', userSchema);
