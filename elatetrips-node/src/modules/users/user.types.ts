export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say' | '';

export type AccountStatus = 'pending' | 'active';

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
