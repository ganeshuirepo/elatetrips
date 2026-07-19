import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../common/errors/AppError';
import type { ConsoleRole, VendorType } from './console.model';

/** Claims carried by a console (admin/vendor dashboard) token. */
export interface ConsoleClaims {
  sub: string; // username
  role: ConsoleRole;
  vendorType?: VendorType;
  refId?: string;
  name: string;
  scope: 'console';
}

const CONSOLE_TOKEN_TTL = '7d';

export function signConsoleToken(claims: Omit<ConsoleClaims, 'scope'>): string {
  return jwt.sign({ ...claims, scope: 'console' }, env.jwtSecret, {
    expiresIn: CONSOLE_TOKEN_TTL,
  } as SignOptions);
}

export function verifyConsoleToken(token: string): ConsoleClaims {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as ConsoleClaims;
    if (decoded.scope !== 'console' || !decoded.sub || !decoded.role) {
      throw new Error('Malformed console token');
    }
    return decoded;
  } catch {
    throw new UnauthorizedError('Invalid or expired console token');
  }
}
