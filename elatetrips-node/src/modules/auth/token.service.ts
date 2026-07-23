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
      const decoded = jwt.verify(token, env.jwtSecret) as TokenPayload;
      if (!decoded?.phone) throw new Error('Malformed token');
      return { phone: decoded.phone };
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }
}
