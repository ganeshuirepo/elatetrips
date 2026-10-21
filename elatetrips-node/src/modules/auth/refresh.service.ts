import { createHash, randomBytes } from 'crypto';
import { Schema, model } from 'mongoose';
import { UnauthorizedError } from '../../common/errors/AppError';

/** Stored hashed — a database leak must not leak usable refresh tokens. */
interface RefreshTokenDoc {
  tokenHash: string;
  phone: string;
  expiresAt: Date;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    tokenHash: { type: String, required: true, unique: true },
    phone: { type: String, required: true, index: true },
    /*
     * Dates, not ISO strings, and that is the whole point: Mongo's TTL monitor
     * only reaps Date values, so as strings these were unreapable and the
     * collection grew for the life of the deployment. Every row is a credential
     * — the one collection that should not accumulate.
     *
     * Rotation deletes the row it consumes, so this only catches what rotation
     * never returns for: the abandoned sessions, which are most of them.
     */
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
  },
  { versionKey: false, strict: true },
);

// expireAfterSeconds: 0 means "delete once expiresAt is in the past".
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Exported so the schema-integrity test can assert the TTL index is present. */
export const RefreshTokenModel = model<RefreshTokenDoc>('refresh_token', refreshTokenSchema);

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
      expiresAt: new Date(Date.now() + this.ttlDays * 86_400_000),
      createdAt: new Date(),
    });
    return raw;
  }

  /** Single-use rotation: consume the old token, hand back the phone + a new one. */
  async rotate(raw: string): Promise<{ phone: string; refreshToken: string }> {
    const doc = await RefreshTokenModel.findOneAndDelete({ tokenHash: hash(raw) }).lean();
    if (!doc) throw new UnauthorizedError('Invalid refresh token — sign in again');
    // `new Date(...)` rather than a bare comparison so rows written before this
    // field was a Date — ISO strings — are still judged correctly on their way
    // out, instead of being accepted forever.
    if (new Date(doc.expiresAt).getTime() < Date.now()) {
      throw new UnauthorizedError('Refresh token expired — sign in again');
    }
    return { phone: doc.phone, refreshToken: await this.issue(doc.phone) };
  }
}
