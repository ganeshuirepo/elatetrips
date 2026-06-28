import { env } from '../../config/env';
import {
  UnauthorizedError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  AppError,
} from '../../common/errors/AppError';
import type { IOtpStore, ITokenService, IPasswordHasher } from './auth.types';
import type { IUserRepository } from '../users/user.repository';
import type { User, SignupData, VerifyChannel } from '../users/user.types';

export interface OtpResult {
  identifier: string;
  channel: VerifyChannel;
  sent: true;
  /** Returned only in non-production so the mock flow is easy to test. */
  devOtp?: string;
}

export interface SessionResult {
  token: string;
  user: User;
}

/**
 * Authentication use cases. Orchestrates the OTP store, token service, password
 * hasher and user repository through their interfaces — no concrete dependency
 * on JWT, bcrypt, the in-memory store, or Mongoose (Dependency Inversion).
 */
export class AuthService {
  constructor(
    private readonly otpStore: IOtpStore,
    private readonly tokenService: ITokenService,
    private readonly hasher: IPasswordHasher,
    private readonly users: IUserRepository,
  ) {}

  private devOtp(code: string): { devOtp?: string } {
    return env.isProd ? {} : { devOtp: code };
  }

  private session(user: User): SessionResult {
    return { token: this.tokenService.sign({ phone: user.phone }), user };
  }

  // ---- Passwordless OTP login (kept for the quick-demo flow) ------------------

  requestOtp(phone: string): OtpResult {
    const code = this.otpStore.issue(phone);
    return { identifier: phone, channel: 'mobile', sent: true, ...this.devOtp(code) };
  }

  async verifyOtp(phone: string, code: string): Promise<SessionResult> {
    if (!this.otpStore.verify(phone, code)) {
      throw new UnauthorizedError('Invalid or expired OTP');
    }
    return this.session(await this.users.ensure(phone));
  }

  // ---- Signup + account verification ----------------------------------------

  async signup(data: SignupData, verifyVia: VerifyChannel): Promise<OtpResult> {
    if (await this.users.findByIdentifier(data.phone)) {
      throw new AppError(409, 'An account with this mobile number already exists');
    }
    if (data.email && (await this.users.findByIdentifier(data.email))) {
      throw new AppError(409, 'An account with this email already exists');
    }

    const passwordHash = await this.hasher.hash(data.password);
    await this.users.createPending(data, passwordHash);

    const identifier = verifyVia === 'email' ? data.email : data.phone;
    const code = this.otpStore.issue(identifier);
    return { identifier, channel: verifyVia, sent: true, ...this.devOtp(code) };
  }

  /** Verify the email/mobile that signup sent an OTP to, activating the account. */
  async verifyAccount(identifier: string, code: string): Promise<SessionResult> {
    const user = await this.users.findByIdentifier(identifier);
    if (!user) throw new NotFoundError('No account found for this identifier');
    if (!this.otpStore.verify(identifier, code)) {
      throw new UnauthorizedError('Invalid or expired OTP');
    }
    const channel: VerifyChannel = identifier === user.email ? 'email' : 'mobile';
    const verified = await this.users.markVerified(identifier, channel);
    return this.session(verified ?? user);
  }

  // ---- Password login -------------------------------------------------------

  async login(identifier: string, password: string): Promise<SessionResult> {
    const creds = await this.users.findCredentials(identifier);
    if (!creds?.passwordHash || !(await this.hasher.compare(password, creds.passwordHash))) {
      throw new UnauthorizedError('Invalid mobile/email or password');
    }
    if (creds.status !== 'active') {
      throw new ForbiddenError('Account not verified. Please verify your email or mobile number.');
    }
    const { passwordHash: _omit, ...user } = creds;
    return this.session(user as User);
  }

  // ---- Forgot / reset password ----------------------------------------------

  async forgotPassword(identifier: string): Promise<OtpResult> {
    const user = await this.users.findByIdentifier(identifier);
    const channel: VerifyChannel = user && identifier === user.email ? 'email' : 'mobile';
    // Only issue a real code when the account exists; always answer "sent" so the
    // endpoint can't be used to enumerate registered users.
    const code = user ? this.otpStore.issue(identifier) : '';
    return { identifier, channel, sent: true, ...(user ? this.devOtp(code) : {}) };
  }

  async resetPassword(identifier: string, code: string, password: string): Promise<SessionResult> {
    if (!this.otpStore.verify(identifier, code)) {
      throw new UnauthorizedError('Invalid or expired OTP');
    }
    const user = await this.users.findByIdentifier(identifier);
    if (!user) throw new BadRequestError('No account found for this identifier');

    const passwordHash = await this.hasher.hash(password);
    await this.users.setPassword(identifier, passwordHash);
    // Controlling the reset channel proves ownership — verify + activate it.
    const channel: VerifyChannel = identifier === user.email ? 'email' : 'mobile';
    const updated = await this.users.markVerified(identifier, channel);
    return this.session(updated ?? user);
  }
}
