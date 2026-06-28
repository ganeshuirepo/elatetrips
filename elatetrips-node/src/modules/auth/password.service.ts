import bcrypt from 'bcryptjs';
import type { IPasswordHasher } from './auth.types';

const SALT_ROUNDS = 10;

/** bcrypt implementation of the password-hasher abstraction. */
export class BcryptPasswordHasher implements IPasswordHasher {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
