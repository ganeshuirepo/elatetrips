import { createHash, randomBytes } from 'crypto';
import { Schema, model } from 'mongoose';
import { UnauthorizedError } from '../../common/errors/AppError';

/** Stored hashed — a database leak must not leak usable refresh tokens. */
interface RefreshTokenDoc {
  tokenHash: string;
  phone: string;
  expiresAt: string;
  createdAt: string;
}

const refreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    tokenHash: { type: String, required: true, unique: true },
    phone: { type: String, required: true, index: true },
    expiresAt: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { versionKey: false, strict: true },
);

const RefreshTokenModel = model<RefreshTokenDoc>('refresh_token', refreshTokenSchema);

const hash = (raw: string): string => createHash('sha256').update(raw).digest('hex');

/**
 * Rotating refresh tokens (closes mobile-backlog gap #3, additive): every
 * session response now carries a `refreshToken` beside the 7-day access
 * token; POST /auth/refresh trades it for a fresh pair and INVALIDATES the
 * old one (single use — a replayed token means it leaked, and the honest
 * answer is a fresh sign-in). Clients that ignore the field keep working
 * exactly as before.
 */
export class RefreshService {
  constructor(private readonly ttlDays = 30) {}

  /** Issue a new refresh token for this account. */
  async issue(phone: string): Promise<string> {
    const raw = randomBytes(48).toString('base64url');
    await RefreshTokenModel.create({
      tokenHash: hash(raw),
      phone,
      expiresAt: new Date(Date.now() + this.ttlDays * 86_400_000).toISOString(),
      createdAt: new Date().toISOString(),
    });
    return raw;
  }

  /** Single-use rotation: consume the old token, hand back the phone + a new one. */
  async rotate(raw: string): Promise<{ phone: string; refreshToken: string }> {
    const doc = await RefreshTokenModel.findOneAndDelete({ tokenHash: hash(raw) }).lean();
    if (!doc) throw new UnauthorizedError('Invalid refresh token — sign in again');
    if (new Date(doc.expiresAt).getTime() < Date.now()) {
      throw new UnauthorizedError('Refresh token expired — sign in again');
    }
    return { phone: doc.phone, refreshToken: await this.issue(doc.phone) };
  }
}
