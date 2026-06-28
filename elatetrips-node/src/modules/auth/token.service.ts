import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../common/errors/AppError';
import type { ITokenService, TokenPayload } from './auth.types';

/** JWT implementation of the token abstraction. */
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
