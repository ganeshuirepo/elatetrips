import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../common/errors/AppError';
import type { ITokenService, TokenPayload } from './auth.types';

/**
 * User JWT adapter (ITokenService) — signs/verifies the tokens app users carry.
 * Claims are just { phone }; expiry comes from env.jwtExpiresIn. verify() maps
 * ANY failure (bad signature, expiry, missing phone) to UnauthorizedError, so
 * the authGuard uniformly answers 401. Note the console (admin/vendor) scope
 * uses a SEPARATE token in console.token, tagged scope:'console' — a user token
 * can therefore never satisfy the console guard even though both share jwtSecret.
 */
export class JwtTokenService implements ITokenService {
  sign(payload: TokenPayload): string {
    return jwt.sign(payload, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn,
    } as SignOptions);
  }

  verify(token: string): TokenPayload {
    try {
      // Match this adapter's signer and validate the runtime boundary. A type
      // assertion cannot distinguish a user identifier from an object/array or
      // a token explicitly issued for another adapter (console/card/etc.).
      const decoded = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        Array.isArray(decoded) ||
        typeof decoded.phone !== 'string' ||
        decoded.phone.trim().length === 0 ||
        decoded.scope !== undefined
      ) {
        throw new Error('Malformed user token');
      }
      return { phone: decoded.phone };
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }
}
