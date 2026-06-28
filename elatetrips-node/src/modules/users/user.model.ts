import { Schema, model } from 'mongoose';
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
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say', ''],
      default: '',
    },
    age: { type: Number, default: null },
    // Excluded from queries unless explicitly selected with '+passwordHash'.
    passwordHash: { type: String, select: false },
    emailVerified: { type: Boolean, default: false },
    mobileVerified: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'active'], default: 'active', index: true },
    billing: { type: billingSchema, default: undefined },
  },
  { timestamps: true, versionKey: false },
);

export const UserModel = model<UserWithSecret>('User', userSchema);
