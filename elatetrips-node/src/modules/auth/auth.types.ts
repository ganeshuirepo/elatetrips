/** JWT claims carried for an authenticated user. */
export interface TokenPayload {
  phone: string;
}

/** Token signing/verification abstraction (lets us swap JWT for anything). */
export interface ITokenService {
  sign(payload: TokenPayload): string;
  verify(token: string): TokenPayload;
}

/**
 * One-time-password store abstraction (in-memory now, Redis/Twilio later).
 * Keyed by any identifier string — a phone number OR an email address.
 */
export interface IOtpStore {
  /** Issue and persist an OTP for an identifier, returning the code. */
  issue(identifier: string): string;
  /** True when a still-valid OTP exists for the identifier and the code is accepted. */
  verify(identifier: string, code: string): boolean;
}

/** Password hashing abstraction (bcrypt now, argon2/scrypt later). */
export interface IPasswordHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
}
