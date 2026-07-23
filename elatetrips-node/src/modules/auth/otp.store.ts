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
    // Per-identifier cooldown: a rapid re-issue is refused here (429) even before
    // the route rate-limiter, curbing send spam / provider cost. Issuing a fresh
    // code also overwrites any live one, so only the latest code ever verifies.
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
    // Nothing issued, or it has expired — drop it and fail closed.
    if (!entry || entry.expiresAt < Date.now()) {
      this.pending.delete(identifier);
      return false;
    }
    if (entry.code !== code) {
      // Count the miss; once too many wrong guesses accumulate, burn the code so
      // an attacker can't keep guessing the same live code to exhaustion.
      entry.attempts += 1;
      if (entry.attempts >= MAX_ATTEMPTS) this.pending.delete(identifier);
      return false;
    }
    // Correct code — consume it so it can never be replayed (single-use).
    this.pending.delete(identifier);
    return true;
  }
}
