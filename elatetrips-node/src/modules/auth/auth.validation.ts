/**
 * Zod schemas for the auth routes. The validate middleware parses req.body
 * against these BEFORE the controller runs and replaces req.body with the typed,
 * coerced result — so the controller/service can trust the shape and never
 * re-check it. Small reusable primitives (phone, otp, password, identifier) are
 * shared across schemas to keep the rules in one place.
 */
import { z } from 'zod';

/**
 * Meet callers where their phone number actually lives: contacts, SMS and
 * WhatsApp print Indian mobiles as "+91 99988 87761", while we store the bare
 * 10 digits. Strip phone punctuation, then a leading +91/91/0 — but a prefix
 * only comes off when a valid 10-digit number remains, so normalizing can never
 * turn one number into another. Emails and anything unrecognizable pass through
 * trimmed for the validator to judge. (Mirrored on the frontend in
 * elatetrips-experiences/src/domain/identifier.ts — keep in sync.)
 */
const MOBILE_DIGITS = 10;
function normalizePhoneish(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (trimmed.includes('@') || !/^[+\d\s\-()]+$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === MOBILE_DIGITS) return digits;
  for (const prefix of ['91', '0']) {
    if (digits.startsWith(prefix) && digits.length === prefix.length + MOBILE_DIGITS) {
      return digits.slice(prefix.length);
    }
  }
  return digits;
}

const phone = z.preprocess(
  normalizePhoneish,
  z.string().regex(/^\d{10}$/, 'Mobile number must be exactly 10 digits'),
);
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

/** Either a 10-digit phone (any human spelling of it) or an email address. */
const identifier = z.preprocess(
  normalizePhoneish,
  z
    .string()
    .min(3)
    .refine((v) => /^\d{10}$/.test(v) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
      message: 'Provide a valid 10-digit mobile number or email',
    }),
);

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

export const refreshSchema = z.object({
  refreshToken: z.string().trim().min(20, 'Provide the refresh token'),
});
