import bcrypt from 'bcryptjs';
import type { IPasswordHasher } from './auth.types';

// bcrypt cost factor: each +1 doubles hashing work. 10 is the common balance
// between resistance to offline cracking and login latency. Salt is generated
// per-hash and embedded in the output string, so compare() needs no stored salt.
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
