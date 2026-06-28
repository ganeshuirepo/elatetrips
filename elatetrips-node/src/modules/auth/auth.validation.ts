import { z } from 'zod';

const phone = z.string().regex(/^\d{10}$/, 'Mobile number must be exactly 10 digits');
const otp = z.string().regex(/^\d{4}$/, 'OTP must be exactly 4 digits');
const password = z.string().min(6, 'Password must be at least 6 characters').max(72);
/** Either a 10-digit phone or an email address. */
const identifier = z
  .string()
  .min(3)
  .refine((v) => /^\d{10}$/.test(v) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
    message: 'Provide a valid 10-digit mobile number or email',
  });

export const requestOtpSchema = z.object({ phone });

export const verifyOtpSchema = z.object({ phone, otp });

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

export const loginSchema = z.object({ identifier, password });

export const forgotPasswordSchema = z.object({ identifier });

export const resetPasswordSchema = z.object({ identifier, otp, password });
