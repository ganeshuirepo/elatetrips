/**
 * Magic-link tokens (FR4.4, BR-15). Pure, dependency-free, unit-testable:
 * mint/verify are functions of their inputs and the config secret only — no
 * clock, provider, or store reached implicitly (the caller passes `now`).
 *
 * A token is `base64url(claims) . base64url(HMAC-SHA256(claims, secret))`. It is:
 *   • signed        — tamper-evident via the HMAC (no secret ⇒ no valid token);
 *   • single-RFQ    — claims carry exactly one rfq_id and verify pins it;
 *   • recipient-bound (BR-15) — claims carry recipient_id and verify pins it;
 *   • expiring       — claims carry an absolute `exp`, checked against `now`.
 *
 * This is deliberately NOT JWT: no dependency, no alg-confusion surface, and a
 * shape small enough to fit a QR/short link. `jsonwebtoken` is already present
 * in node_modules but is not needed here.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CommsConfig } from './comms.config';
import type { MagicLinkClaims, VerifyResult } from './comms.types';

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(payloadPart: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payloadPart).digest());
}

export interface MintInput {
  rfq_id: string;
  recipient_id: string;
  purpose: string;
  /** Now, injected so the function stays pure and testable. */
  now: Date;
  config: CommsConfig;
}

/**
 * Mints a token. Throws if the config cannot produce a valid one (no secret, or
 * no positive TTL) — fail closed rather than emit a forgeable/never-expiring
 * link. `nonce` guarantees two mints for the same recipient differ.
 */
export function mintMagicLink(input: MintInput): { token: string; claims: MagicLinkClaims } {
  const { config } = input;
  if (!config.token_secret) throw new Error('COMM_TOKEN_SECRET is not configured; refusing to mint an unsigned token');
  const ttl = config.token_ttl_minutes;
  if (!ttl || ttl <= 0) throw new Error('COMM_TOKEN_TTL_MINUTES is not configured; refusing to mint a non-expiring token');

  const claims: MagicLinkClaims = {
    rfq_id: input.rfq_id,
    recipient_id: input.recipient_id,
    purpose: input.purpose,
    exp: input.now.getTime() + ttl * 60_000,
    nonce: b64url(randomBytes(9)),
  };
  const payloadPart = b64url(Buffer.from(JSON.stringify(claims), 'utf8'));
  const token = `${payloadPart}.${sign(payloadPart, config.token_secret)}`;
  return { token, claims };
}

export interface VerifyInput {
  token: string;
  now: Date;
  config: CommsConfig;
  /** Optional pins — verify fails if the token is for another RFQ/recipient. */
  expect_rfq_id?: string;
  expect_recipient_id?: string;
}

/** Verifies signature, expiry, and (when supplied) the RFQ/recipient binding. */
export function verifyMagicLink(input: VerifyInput): VerifyResult {
  const { config } = input;
  if (!config.token_secret) return { valid: false, reason: 'bad_signature' };

  const parts = input.token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { valid: false, reason: 'malformed' };
  const [payloadPart, sigPart] = parts;

  const expected = sign(payloadPart, config.token_secret);
  const a = Buffer.from(sigPart);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false, reason: 'bad_signature' };

  let claims: MagicLinkClaims;
  try {
    claims = JSON.parse(b64urlDecode(payloadPart).toString('utf8')) as MagicLinkClaims;
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (typeof claims.exp !== 'number' || !claims.rfq_id || !claims.recipient_id) {
    return { valid: false, reason: 'malformed' };
  }
  if (input.now.getTime() >= claims.exp) return { valid: false, reason: 'expired' };
  if (input.expect_rfq_id && input.expect_rfq_id !== claims.rfq_id) return { valid: false, reason: 'wrong_rfq' };
  if (input.expect_recipient_id && input.expect_recipient_id !== claims.recipient_id) {
    return { valid: false, reason: 'wrong_recipient' };
  }
  return { valid: true, claims };
}
