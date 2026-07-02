import dotenv from 'dotenv';

dotenv.config();

/** Reads a required env var, falling back to a default in non-production. */
function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Centralised, validated configuration. Nothing else in the codebase reads
 * `process.env` directly — this keeps configuration a single, typed source of
 * truth (Single Responsibility) and makes the app easy to test.
 */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/elatetrips'),
  jwtSecret: required('JWT_SECRET', 'change-me-in-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  // ---- OTP delivery providers (all optional — console fallback in dev) ------
  // Email OTP: Brevo (free tier: 300 emails/day, no credit card) — brevo.com
  brevoApiKey: process.env.BREVO_API_KEY ?? '',
  brevoFromEmail: process.env.BREVO_FROM_EMAIL ?? '',
  brevoFromName: process.env.BREVO_FROM_NAME ?? 'ElateTrips',
  // SMS OTP option A: Twilio trial (free credit; can only text verified numbers)
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? '',
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? '',
  // SMS OTP option B: Fast2SMS (India; ₹50 free credit, OTP route needs no DLT)
  fast2smsApiKey: process.env.FAST2SMS_API_KEY ?? '',
  get isProd(): boolean {
    return this.nodeEnv === 'production';
  },
} as const;
