import { z } from 'zod';

const phone = z.string().regex(/^\d{10}$/, 'Mobile number must be exactly 10 digits');
const otp = z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits');

/**
 * MakeMyTrip-style password policy: 8–32 characters with at least one
 * uppercase letter, one lowercase letter, one digit and one special character.
 * (Mirrored on the frontend in src/domain/password.ts — keep in sync.)
 */
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(32, 'Password must be at most 32 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/\d/, 'Password must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character');

/** Either a 10-digit phone or an email address. */
const identifier = z
  .string()
  .min(3)
  .refine((v) => /^\d{10}$/.test(v) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
    message: 'Provide a valid 10-digit mobile number or email',
  });

export const requestOtpSchema = z.object({ identifier });

export const verifyOtpSchema = z.object({ identifier, otp });

export const resendOtpSchema = z.object({ identifier });

export const signupSchema = z.object({
  name: z.string().min(2, 'Name is required').max(120),
  email: z.string().email('Valid email is required'),
  phone,
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']),
  age: z.coerce.number().int().min(1).max(120),
  password,
  verifyVia: z.enum(['email', 'mobile']).default('mobile'),
});

export const verifyAccountSchema = z.object({ identifier, otp });

export const loginSchema = z.object({ identifier, password: z.string().min(1) });

export const forgotPasswordSchema = z.object({ identifier });

export const resetPasswordSchema = z.object({ identifier, otp, password });
