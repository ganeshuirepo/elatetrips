/**
 * Run by auth.service.test.ts in a CHILD process with NODE_ENV=production.
 *
 * It has to be a separate process because `env.nodeEnv` is read once at import;
 * flipping process.env afterwards would not change it, and a test that appears
 * to check production behaviour while actually running in development is worse
 * than no test at all.
 *
 * Asserts the one thing that must never regress: the dev echo of the OTP
 * (`devOtp`) is absent from the response in production. Leaking it would put a
 * live credential in the API response, the browser network tab, and every proxy
 * log between here and the traveller.
 *
 * Exits 0 when the code is absent, 1 with a message when it leaks.
 */
import { AuthService } from '../auth.service';
import { InMemoryOtpStore } from '../otp.store';
import type { IOtpSender, IPasswordHasher, ITokenService } from '../auth.types';
import type { IUserRepository } from '../../users/user.repository';
import type { User } from '../../users/user.types';

const noopSender: IOtpSender = { async send(): Promise<void> {} };
const tokens: ITokenService = { sign: () => 'token', verify: () => ({ phone: 'x' }) };
const hasher: IPasswordHasher = { hash: async (p) => p, compare: async () => true };

const user: User = {
  phone: '9876543210',
  email: 'asha@example.com',
  name: 'Asha Rao',
  gender: 'female',
  age: 29,
  emailVerified: false,
  mobileVerified: false,
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Only the two lookups requestOtp actually reaches for; the rest would be dead
// weight in a fixture whose whole job is one assertion.
const users = {
  findByIdentifier: async () => user,
  findByPhone: async () => user,
} as unknown as IUserRepository;

async function main(): Promise<void> {
  const service = new AuthService(new InMemoryOtpStore(), noopSender, tokens, hasher, users);
  const result = await service.requestOtp(user.email);

  if ('devOtp' in result && result.devOtp !== undefined) {
    console.error(`LEAK: devOtp present in production response (${String(result.devOtp)})`);
    process.exit(1);
  }
  process.exit(0);
}

void main();
