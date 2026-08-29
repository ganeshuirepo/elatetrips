/**
 * AuthService tests — the authorization rules, exercised against fakes for
 * every port (store, sender, tokens, hasher, repository) so no database, no
 * JWT library and no provider account is involved.
 * Run: `npm test` (Node's own runner; see scripts/register-ts.js).
 *
 * What these pin down, in order of what would hurt most if it broke:
 *   • a code proves ONE channel, and only the one it was sent to;
 *   • channel verification is aimed by the SERVER, never by the caller — the
 *     single property that stops a code reaching an address you do not own;
 *   • a wrong password and an unknown account answer identically;
 *   • forgot-password and resend never confirm whether an account exists;
 *   • the dev echo of the code (`devOtp`) never appears in production;
 *   • auto-activate is the only thing that lets an unverified account in.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { AuthService } from './auth.service';
import { InMemoryOtpStore } from './otp.store';
import type { IOtpSender, IPasswordHasher, ITokenService, TokenPayload } from './auth.types';
import type { IUserRepository } from '../users/user.repository';
import type { SignupData, User, UserWithSecret, VerifyChannel } from '../users/user.types';
import { AppError } from '../../common/errors/AppError';

// ---------------------------------------------------------------- fakes ----

/** Records every send so a test can assert WHERE a code actually went. */
class RecordingSender implements IOtpSender {
  readonly sent: { channel: VerifyChannel; identifier: string; code: string }[] = [];
  async send(channel: VerifyChannel, identifier: string, code: string): Promise<void> {
    this.sent.push({ channel, identifier, code });
  }
  get last(): { channel: VerifyChannel; identifier: string; code: string } {
    const entry = this.sent.at(-1);
    assert.ok(entry, 'expected a code to have been sent');
    return entry;
  }
}

const tokens: ITokenService = {
  sign: (payload: TokenPayload) => `token-for-${payload.phone}`,
  verify: () => ({ phone: 'unused' }),
};

/** Reversible stand-in for bcrypt — fast, and obvious in a failure message. */
const hasher: IPasswordHasher = {
  hash: async (plain) => `hashed:${plain}`,
  compare: async (plain, hash) => hash === `hashed:${plain}`,
};

function makeUser(over: Partial<UserWithSecret> = {}): UserWithSecret {
  return {
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
    ...over,
  };
}

/** In-memory repository keyed by phone, matching IUserRepository's contract. */
class FakeUserRepository implements IUserRepository {
  readonly rows = new Map<string, UserWithSecret>();

  seed(user: UserWithSecret): UserWithSecret {
    this.rows.set(user.phone, user);
    return user;
  }

  private strip(u: UserWithSecret | undefined): User | null {
    if (!u) return null;
    const { passwordHash: _omit, ...rest } = u;
    return rest;
  }

  private find(identifier: string): UserWithSecret | undefined {
    for (const row of this.rows.values()) {
      if (row.phone === identifier || row.email === identifier) return row;
    }
    return undefined;
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.strip(this.rows.get(phone));
  }
  async findByIdentifier(identifier: string): Promise<User | null> {
    return this.strip(this.find(identifier));
  }
  async findCredentials(identifier: string): Promise<UserWithSecret | null> {
    return this.find(identifier) ?? null;
  }
  async ensure(phone: string): Promise<User> {
    const existing = this.rows.get(phone);
    if (existing) return this.strip(existing) as User;
    return this.strip(this.seed(makeUser({ phone, mobileVerified: true }))) as User;
  }
  async createPending(data: SignupData, passwordHash: string): Promise<User> {
    return this.strip(
      this.seed(makeUser({ ...data, passwordHash, status: 'pending' })),
    ) as User;
  }
  async updatePending(data: SignupData, passwordHash: string): Promise<User | null> {
    return this.strip(this.seed(makeUser({ ...data, passwordHash, status: 'pending' })));
  }
  async markVerified(identifier: string, channel: VerifyChannel): Promise<User | null> {
    const row = this.find(identifier);
    if (!row) return null;
    if (channel === 'email') row.emailVerified = true;
    else row.mobileVerified = true;
    row.status = 'active';
    return this.strip(row);
  }
  async activate(identifier: string): Promise<User | null> {
    const row = this.find(identifier);
    if (!row) return null;
    row.status = 'active';
    return this.strip(row);
  }
  async setPassword(identifier: string, passwordHash: string): Promise<User | null> {
    const row = this.find(identifier);
    if (!row) return null;
    row.passwordHash = passwordHash;
    return this.strip(row);
  }
  async updateProfile(): Promise<User | null> {
    throw new Error('not used by AuthService');
  }
}

// -------------------------------------------------------------- harness ----

interface Harness {
  service: AuthService;
  users: FakeUserRepository;
  sender: RecordingSender;
  store: InMemoryOtpStore;
}

function build(autoActivate = false): Harness {
  const users = new FakeUserRepository();
  const sender = new RecordingSender();
  const store = new InMemoryOtpStore();
  return {
    users,
    sender,
    store,
    service: new AuthService(store, sender, tokens, hasher, users, autoActivate),
  };
}

const SIGNUP: SignupData = {
  name: 'Asha Rao',
  email: 'asha@example.com',
  phone: '9876543210',
  gender: 'female',
  age: 29,
  password: 'Str0ng!Pass',
};

/** Assert an AppError with the given status, rather than merely "it threw". */
async function rejectsWith(status: number, run: () => Promise<unknown>): Promise<AppError> {
  try {
    await run();
  } catch (err) {
    assert.ok(err instanceof AppError, `expected AppError, got ${String(err)}`);
    assert.equal(err.statusCode, status);
    return err;
  }
  return assert.fail(`expected a ${status}, but the call resolved`);
}

// ------------------------------------------------------- signup + verify ----

test('signup sends the code to the channel the traveller chose', async () => {
  const { service, sender } = build();
  await service.signup(SIGNUP, 'mobile');
  assert.equal(sender.last.channel, 'mobile');
  assert.equal(sender.last.identifier, SIGNUP.phone);
});

test('signup by email addresses the code to the email, not the phone', async () => {
  const { service, sender } = build();
  await service.signup(SIGNUP, 'email');
  assert.equal(sender.last.channel, 'email');
  assert.equal(sender.last.identifier, SIGNUP.email);
});

test('signup leaves the account inactive until the code comes back', async () => {
  const { service, users } = build();
  await service.signup(SIGNUP, 'email');
  assert.equal(users.rows.get(SIGNUP.phone)?.status, 'pending');
});

test('verifying proves ONLY the channel the code went to', async () => {
  // The reason the second-channel flow has to exist at all.
  const { service, users, sender } = build();
  await service.signup(SIGNUP, 'email');
  await service.verifyAccount(SIGNUP.email, sender.last.code);

  const row = users.rows.get(SIGNUP.phone);
  assert.equal(row?.emailVerified, true);
  assert.equal(row?.mobileVerified, false, 'the mobile was never proved');
  assert.equal(row?.status, 'active');
});

test('a wrong code does not activate the account', async () => {
  const { service, users } = build();
  await service.signup(SIGNUP, 'email');
  await rejectsWith(401, () => service.verifyAccount(SIGNUP.email, '000000'));
  assert.equal(users.rows.get(SIGNUP.phone)?.status, 'pending');
});

test('signup refuses a mobile that belongs to an active account', async () => {
  const { service, users } = build();
  users.seed(makeUser({ status: 'active' }));
  await rejectsWith(409, () => service.signup(SIGNUP, 'email'));
});

test('signup refuses an email held by somebody else mid-signup', async () => {
  // Same email, different phone: letting this through would hand one person a
  // code for an address another person is in the middle of proving.
  const { service, users } = build();
  users.seed(makeUser({ phone: '9000000000', status: 'pending' }));
  await rejectsWith(409, () => service.signup(SIGNUP, 'email'));
});

test('signup CAN be re-attempted while it is still pending on the same phone', async () => {
  // A typo'd email or a failed delivery must not lock the number out forever.
  const { service, users } = build();
  users.seed(makeUser({ status: 'pending' }));
  await service.signup(SIGNUP, 'email');
  assert.equal(users.rows.get(SIGNUP.phone)?.status, 'pending');
});

test('auto-activate skips the code entirely and returns a session', async () => {
  const { service, sender } = build(true);
  const result = await service.signup(SIGNUP, 'email');
  assert.ok('token' in result, 'expected a session');
  assert.equal(sender.sent.length, 0, 'no code should have been sent');
});

// ----------------------------------------------------------------- login ----

test('a wrong password and an unknown account answer identically', async () => {
  // Differing messages would turn login into an account-existence oracle.
  const { service, users } = build();
  users.seed(makeUser({ passwordHash: 'hashed:Str0ng!Pass' }));

  const wrong = await rejectsWith(401, () => service.login(SIGNUP.phone, 'nope'));
  const missing = await rejectsWith(401, () => service.login('9000000000', 'nope'));
  assert.equal(wrong.message, missing.message);
});

test('a correct password on an unverified account is refused', async () => {
  const { service, users } = build();
  users.seed(makeUser({ passwordHash: 'hashed:Str0ng!Pass', status: 'pending' }));
  await rejectsWith(403, () => service.login(SIGNUP.phone, 'Str0ng!Pass'));
});

test('auto-activate lets that same account through, and only then', async () => {
  const { service, users } = build(true);
  users.seed(makeUser({ passwordHash: 'hashed:Str0ng!Pass', status: 'pending' }));
  const session = await service.login(SIGNUP.phone, 'Str0ng!Pass');
  assert.equal(session.token, `token-for-${SIGNUP.phone}`);
});

test('a session never carries the password hash back to the caller', async () => {
  const { service, users } = build();
  users.seed(makeUser({ passwordHash: 'hashed:Str0ng!Pass' }));
  const session = await service.login(SIGNUP.phone, 'Str0ng!Pass');
  assert.equal('passwordHash' in session.user, false);
});

// ------------------------------------------------------ OTP login + noise ----

test('OTP login verifies the channel it was sent to', async () => {
  const { service, users, sender } = build();
  users.seed(makeUser());
  await service.requestOtp(SIGNUP.email);
  const session = await service.verifyOtp(SIGNUP.email, sender.last.code);
  assert.equal(session.user.emailVerified, true);
});

test('OTP login refuses a wrong code', async () => {
  const { service, users } = build();
  users.seed(makeUser());
  await service.requestOtp(SIGNUP.email);
  await rejectsWith(401, () => service.verifyOtp(SIGNUP.email, '000000'));
});

test('forgot-password answers "sent" for an unknown account, without sending', async () => {
  // Non-enumerating: the shape matches success, but no code is issued and no
  // provider bill is incurred for an address that is not ours.
  const { service, sender } = build();
  const result = await service.forgotPassword('9000000000');
  assert.equal(result.sent, true);
  assert.equal(sender.sent.length, 0);
});

test('resend does the same for an unknown account', async () => {
  const { service, sender } = build();
  const result = await service.resendOtp('nobody@example.com');
  assert.equal(result.sent, true);
  assert.equal(sender.sent.length, 0);
});

test('resetting the password also proves the channel it was reset through', async () => {
  const { service, users, sender } = build();
  users.seed(makeUser({ passwordHash: 'hashed:old' }));
  await service.forgotPassword(SIGNUP.email);
  await service.resetPassword(SIGNUP.email, sender.last.code, 'N3w!Password');

  const row = users.rows.get(SIGNUP.phone);
  assert.equal(row?.passwordHash, 'hashed:N3w!Password');
  assert.equal(row?.emailVerified, true);
});

test('a wrong reset code leaves the old password in place', async () => {
  const { service, users } = build();
  users.seed(makeUser({ passwordHash: 'hashed:old' }));
  await service.forgotPassword(SIGNUP.email);
  await rejectsWith(401, () => service.resetPassword(SIGNUP.email, '000000', 'N3w!Password'));
  assert.equal(users.rows.get(SIGNUP.phone)?.passwordHash, 'hashed:old');
});

// ------------------------------------------------- the dev echo of the code ----

test('the code is echoed back outside production, so dev needs no inbox', async () => {
  const { service, users } = build();
  users.seed(makeUser());
  const result = await service.requestOtp(SIGNUP.email);
  assert.match(String(result.devOtp), /^\d{6}$/);
});

test('the code is NEVER echoed back in production', () => {
  // Runs in a child process on purpose: env.nodeEnv is read once at import, so
  // flipping process.env here would leave us "testing production" while still
  // in development — a green test that proves nothing. The fixture exits
  // non-zero if devOtp appears. A leak here would put a live credential in the
  // API response, the browser network tab and every proxy log in between.
  const fixture = require.resolve('./__fixtures__/devotp-prod-check.ts');
  const result = spawnSync(
    process.execPath,
    ['-r', resolve(__dirname, '../../../scripts/register-ts.js'), fixture],
    { env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

// ------------------------------------------------ proving the second channel ----

test('the code goes to the address ON FILE for the authenticated account', async () => {
  // The property the whole endpoint exists for: the caller names a CHANNEL,
  // never a destination, so a code cannot be steered to an address they do not
  // already own.
  const { service, users, sender } = build();
  users.seed(makeUser({ emailVerified: true }));
  await service.requestChannelVerification(SIGNUP.phone, 'mobile');

  assert.equal(sender.last.channel, 'mobile');
  assert.equal(sender.last.identifier, SIGNUP.phone);
});

test('confirming marks that channel, and leaves the other one alone', async () => {
  const { service, users, sender } = build();
  users.seed(makeUser({ emailVerified: true }));
  await service.requestChannelVerification(SIGNUP.phone, 'mobile');
  const updated = await service.confirmChannelVerification(
    SIGNUP.phone,
    'mobile',
    sender.last.code,
  );

  assert.equal(updated.mobileVerified, true);
  assert.equal(updated.emailVerified, true);
});

test('a wrong code leaves the channel unproved', async () => {
  const { service, users } = build();
  users.seed(makeUser());
  await service.requestChannelVerification(SIGNUP.phone, 'mobile');
  await rejectsWith(401, () =>
    service.confirmChannelVerification(SIGNUP.phone, 'mobile', '000000'),
  );
  assert.equal(users.rows.get(SIGNUP.phone)?.mobileVerified, false);
});

test('a code issued for one channel does not confirm the other', async () => {
  // Both codes live under different identifiers; crossing them would let one
  // delivery prove a channel it never reached.
  const { service, users, sender } = build();
  users.seed(makeUser());
  await service.requestChannelVerification(SIGNUP.phone, 'email');
  const emailCode = sender.last.code;

  await rejectsWith(401, () =>
    service.confirmChannelVerification(SIGNUP.phone, 'mobile', emailCode),
  );
  assert.equal(users.rows.get(SIGNUP.phone)?.mobileVerified, false);
});

test('an already-verified channel is refused rather than re-sent', async () => {
  const { service, users, sender } = build();
  users.seed(makeUser({ mobileVerified: true }));
  await rejectsWith(400, () => service.requestChannelVerification(SIGNUP.phone, 'mobile'));
  assert.equal(sender.sent.length, 0, 'no provider bill for a no-op');
});

test('a token for an account that no longer exists is refused', async () => {
  // A valid JWT outlives the account it names; failing closed is the only
  // safe reading of "the row is gone".
  const { service } = build();
  await rejectsWith(401, () => service.requestChannelVerification('9000000000', 'mobile'));
});

test('a channel with no address on file is a 400, not a send to nowhere', async () => {
  const { service, users, sender } = build();
  users.seed(makeUser({ email: '' }));
  await rejectsWith(400, () => service.requestChannelVerification(SIGNUP.phone, 'email'));
  assert.equal(sender.sent.length, 0);
});
