import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '../errors/AppError';

/**
 * Fixed-window rate limiting for endpoints that guess secrets (login, OTP
 * verify) or cost money (OTP issue — every send is an SMS/email bill).
 *
 * In-memory and single-instance, exactly like InMemoryOtpStore, and carries the
 * same caveat: swap the store for Redis once the API runs on more than one
 * instance, or each instance will enforce its own share of the limit.
 *
 * Keyed by client IP, which requires `trust proxy` to be set (see app.ts) —
 * behind nginx every request otherwise arrives from 127.0.0.1 and a per-client
 * limit silently becomes a global one.
 */

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests allowed per key per window. */
  max: number;
  /** Message returned once the limit is hit. */
  message: string;
  /**
   * Extra key material beyond the client IP — e.g. the submitted username, so
   * one attacker cannot lock every account from a single address, and a shared
   * NAT egress cannot lock out an office.
   */
  keyOn?: (req: Request) => string;
}

/** Reads the field only when it is a usable string; body shape is unvalidated here. */
export function bodyField(name: string): (req: Request) => string {
  return (req) => {
    const body: unknown = req.body;
    if (typeof body !== 'object' || body === null) return '';
    const value = (body as Record<string, unknown>)[name];
    return typeof value === 'string' ? value.toLowerCase().slice(0, 128) : '';
  };
}

const SWEEP_EVERY = 500; // entries added between expiry sweeps

export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const windows = new Map<string, Window>();
  let sinceSweep = 0;

  /** Drops expired windows so the map cannot grow without bound. */
  function sweep(now: number): void {
    for (const [key, win] of windows) {
      if (win.resetAt <= now) windows.delete(key);
    }
  }

  return function limiter(req: Request, _res: Response, next: NextFunction): void {
    const now = Date.now();
    if (++sinceSweep >= SWEEP_EVERY) {
      sinceSweep = 0;
      sweep(now);
    }

    const key = `${req.ip ?? 'unknown'}|${opts.keyOn ? opts.keyOn(req) : ''}`;
    const win = windows.get(key);

    if (!win || win.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }

    win.count += 1;
    if (win.count > opts.max) {
      const retryIn = Math.ceil((win.resetAt - now) / 1000);
      throw new AppError(429, `${opts.message} Try again in ${retryIn}s.`);
    }
    next();
  };
}

const MINUTE = 60 * 1000;

/** Password/OTP guessing: per IP *and* per submitted identifier. */
export const loginRateLimit = (keyOn: (req: Request) => string): RequestHandler =>
  rateLimit({
    windowMs: 15 * MINUTE,
    max: 10,
    message: 'Too many sign-in attempts.',
    keyOn,
  });

/** Outbound SMS/email: every request past the limit is real money. */
export const otpSendRateLimit = (keyOn: (req: Request) => string): RequestHandler =>
  rateLimit({
    windowMs: 15 * MINUTE,
    max: 5,
    message: 'Too many codes requested.',
    keyOn,
  });
