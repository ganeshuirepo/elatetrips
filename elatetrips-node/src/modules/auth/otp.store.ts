import { env } from '../../config/env';
import type { IOtpStore } from './auth.types';

const TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * In-memory OTP store for the mock auth flow. An OTP must be issued before it
 * can be verified, but — preserving the app's "enter any 4 digits" behaviour —
 * verification accepts the configured MOCK_OTP or ANY 4-digit code.
 *
 * Swappable for a Redis/SMS-backed store via the IOtpStore contract.
 */
export class InMemoryOtpStore implements IOtpStore {
  private readonly pending = new Map<string, { code: string; expiresAt: number }>();

  issue(phone: string): string {
    const code = env.mockOtp;
    this.pending.set(phone, { code, expiresAt: Date.now() + TTL_MS });
    return code;
  }

  verify(phone: string, code: string): boolean {
    const entry = this.pending.get(phone);
    if (!entry || entry.expiresAt < Date.now()) return false;
    const accepted = code === entry.code || /^\d{4}$/.test(code);
    if (accepted) this.pending.delete(phone);
    return accepted;
  }
}
