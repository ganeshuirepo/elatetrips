/**
 * What a person may pick, and separately what may be STORED.
 *
 * They are not the same set, and saying so explicitly is the point: '' means
 * "never answered", which is the default on every account created before the
 * question was asked — but it is not something anyone can choose, so the signup
 * schema builds on GENDER_CHOICES while the column allows GENDERS. Two lists
 * that were previously unrelated literals in three files, disagreeing quietly.
 */
export const GENDER_CHOICES = ['male', 'female', 'other', 'prefer_not_to_say'] as const;
export const GENDERS = [...GENDER_CHOICES, ''] as const;
export type Gender = (typeof GENDERS)[number];

export const ACCOUNT_STATUSES = ['pending', 'active'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface BillingDetails {
  name: string;
  email: string;
  address: string;
  city: string;
  pin: string;
  gst: string;
}

/** A user account, keyed by its mobile number. Password is never exposed in this DTO. */
export interface User {
  phone: string;
  email: string;
  name: string;
  gender: Gender;
  age: number | null;
  emailVerified: boolean;
  mobileVerified: boolean;
  status: AccountStatus;
  billing?: BillingDetails;
  createdAt: Date;
  updatedAt: Date;
}

/** User plus the password hash — only loaded for credential checks. */
export interface UserWithSecret extends User {
  passwordHash?: string;
}

/** Data captured by the signup form (password is plaintext at the boundary). */
export interface SignupData {
  name: string;
  email: string;
  phone: string;
  gender: Gender;
  age: number;
  password: string;
}

/** Fields a user may update on their profile. */
export interface ProfileUpdate {
  name?: string;
  email?: string;
  billing?: Partial<BillingDetails>;
}

export type VerifyChannel = 'email' | 'mobile';
