import { randomInt } from 'crypto';
import { AppError } from '../../common/errors/AppError';
import type { IOtpStore } from './auth.types';

const TTL_MS = 5 * 60 * 1000; // codes expire after 5 minutes
const MAX_ATTEMPTS = 5; // wrong guesses before the code is burned
const RESEND_COOLDOWN_MS = 30 * 1000; // min gap between issues per identifier

interface PendingOtp {
  code: string;
  expiresAt: number;
  attempts: number;
  issuedAt: number;
}

/**
 * In-memory OTP store issuing random 6-digit codes with strict verification:
 * expiry, a wrong-guess limit, and a resend cooldown. Codes are single-use.
 *
 * Swappable for a Redis-backed store via the IOtpStore contract (needed once
 * the API runs on more than one instance).
 */
export class InMemoryOtpStore implements IOtpStore {
  private readonly pending = new Map<string, PendingOtp>();

  issue(identifier: string): string {
    const existing = this.pending.get(identifier);
    if (existing && Date.now() - existing.issuedAt < RESEND_COOLDOWN_MS) {
      throw new AppError(429, 'Please wait a few seconds before requesting another OTP');
    }
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    this.pending.set(identifier, {
      code,
      expiresAt: Date.now() + TTL_MS,
      attempts: 0,
      issuedAt: Date.now(),
    });
    return code;
  }

  verify(identifier: string, code: string): boolean {
    const entry = this.pending.get(identifier);
    if (!entry || entry.expiresAt < Date.now()) {
      this.pending.delete(identifier);
      return false;
    }
    if (entry.code !== code) {
      entry.attempts += 1;
      if (entry.attempts >= MAX_ATTEMPTS) this.pending.delete(identifier);
      return false;
    }
    this.pending.delete(identifier);
    return true;
  }
}
