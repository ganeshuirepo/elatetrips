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

const INSECURE_JWT_DEFAULT = 'change-me-in-production';

/**
 * The JWT signing secret. Best practice: an empty or default secret is fatal in
 * production (forgeable tokens), so we fail closed there; in dev we fall back to
 * a placeholder so local work keeps running.
 */
function resolveJwtSecret(): string {
  const raw = (process.env.JWT_SECRET ?? '').trim();
  const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
  if (!raw || raw === INSECURE_JWT_DEFAULT) {
    if (isProd) {
      throw new Error('JWT_SECRET must be set to a strong, non-default value in production');
    }
    return raw || INSECURE_JWT_DEFAULT;
  }
  return raw;
}

const corsRaw = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').trim();

/**
 * Centralised, validated configuration. Nothing else in the codebase reads
 * `process.env` directly — this keeps configuration a single, typed source of
 * truth (Single Responsibility) and makes the app easy to test.
 */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** TEMP: activate accounts at signup without OTP (no SMS/email provider is
   *  wired yet). Set AUTH_AUTO_ACTIVATE=false once verification goes live —
   *  the whole OTP flow (issue/verify/resend) stays in place for that day. */
  authAutoActivate: process.env.AUTH_AUTO_ACTIVATE !== 'false',
  port: Number(process.env.PORT ?? 4000),
  /** `CORS_ORIGINS=*` allows any origin (fine for a token-auth API with no
   *  cookies); otherwise a comma-separated allowlist. */
  corsAllowAll: corsRaw === '*',
  corsOrigins: corsRaw === '*'
    ? []
    : corsRaw.split(',').map((o) => o.trim()).filter(Boolean),
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/elatetrips'),
  jwtSecret: resolveJwtSecret(),
  /** Shared secret for the admin console (mock-first; real accounts later). */
  adminKey: process.env.ADMIN_KEY ?? 'elate-admin-key',
  /** Access-token lifetime — fully env-driven (e.g. 15m, 1h, 7d). Short is
   *  best-practice; the mobile client transparently rotates on expiry. */
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  /** Refresh-token lifetime in days — env-driven, no code change to tune. */
  refreshExpiresDays: Number(process.env.REFRESH_EXPIRES_DAYS ?? 30),
  /** Where uploaded photos are written (disk mock-first storage). */
  uploadsDir: process.env.UPLOADS_DIR ?? 'uploads',
  /** Absolute base for URLs the API hands out (uploaded photo links). */
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,

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
