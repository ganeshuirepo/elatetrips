import { env } from '../../config/env';
import {
  UnauthorizedError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  AppError,
} from '../../common/errors/AppError';
import type { IOtpStore, IOtpSender, ITokenService, IPasswordHasher } from './auth.types';
import type { IUserRepository } from '../users/user.repository';
import type { User, SignupData, VerifyChannel } from '../users/user.types';

export interface OtpResult {
  identifier: string;
  channel: VerifyChannel;
  sent: true;
  /** Returned only in non-production so flows are testable without a provider. */
  devOtp?: string;
}

export interface SessionResult {
  token: string;
  user: User;
}

/**
 * Authentication use cases. Orchestrates the OTP store, OTP sender, token
 * service, password hasher and user repository through their interfaces — no
 * concrete dependency on JWT, bcrypt, Brevo/Twilio, or Mongoose.
 */
export class AuthService {
  constructor(
    private readonly otpStore: IOtpStore,
    private readonly otpSender: IOtpSender,
    private readonly tokenService: ITokenService,
    private readonly hasher: IPasswordHasher,
    private readonly users: IUserRepository,
  ) {}

  private session(user: User): SessionResult {
    return { token: this.tokenService.sign({ phone: user.phone }), user };
  }

  /** Which channel an identifier belongs to for a given user. */
  private channelFor(user: User, identifier: string): VerifyChannel {
    return identifier === user.email ? 'email' : 'mobile';
  }

  /** Issue a fresh OTP and deliver it over the channel's configured provider. */
  private async issueAndSend(identifier: string, channel: VerifyChannel): Promise<OtpResult> {
    const code = this.otpStore.issue(identifier);
    await this.otpSender.send(channel, identifier, code);
    return { identifier, channel, sent: true, ...(env.isProd ? {} : { devOtp: code }) };
  }

  // ---- OTP login (email or mobile, existing accounts only) -------------------

  async requestOtp(identifier: string): Promise<OtpResult> {
    const user = await this.users.findByIdentifier(identifier);
    if (!user) {
      throw new NotFoundError('No account found for this mobile/email. Please sign up first.');
    }
    return this.issueAndSend(identifier, this.channelFor(user, identifier));
  }

  async verifyOtp(identifier: string, code: string): Promise<SessionResult> {
    if (!this.otpStore.verify(identifier, code)) {
      throw new UnauthorizedError('Invalid or expired OTP');
    }
    const user = await this.users.findByIdentifier(identifier);
    if (!user) throw new NotFoundError('No account found for this identifier');
    // Receiving the code proves ownership of the channel — verify + activate it.
    const verified = await this.users.markVerified(identifier, this.channelFor(user, identifier));
    return this.session(verified ?? user);
  }

  // ---- Signup + account verification ----------------------------------------

  async signup(data: SignupData, verifyVia: VerifyChannel): Promise<OtpResult> {
    const byPhone = await this.users.findByIdentifier(data.phone);
    if (byPhone && byPhone.status !== 'pending') {
      throw new AppError(409, 'An account with this mobile number already exists');
    }
    const byEmail = await this.users.findByIdentifier(data.email);
    if (byEmail && (byEmail.status !== 'pending' || byEmail.phone !== data.phone)) {
      throw new AppError(409, 'An account with this email already exists');
    }

    const passwordHash = await this.hasher.hash(data.password);
    // A pending (never-verified) signup may be re-submitted — replace it so a
    // failed OTP delivery or typo'd email doesn't lock the number out forever.
    if (byPhone) {
      await this.users.updatePending(data, passwordHash);
    } else {
      await this.users.createPending(data, passwordHash);
    }

    const identifier = verifyVia === 'email' ? data.email : data.phone;
    return this.issueAndSend(identifier, verifyVia);
  }

  /** Verify the email/mobile that signup sent an OTP to, activating the account. */
  async verifyAccount(identifier: string, code: string): Promise<SessionResult> {
    const user = await this.users.findByIdentifier(identifier);
    if (!user) throw new NotFoundError('No account found for this identifier');
    if (!this.otpStore.verify(identifier, code)) {
      throw new UnauthorizedError('Invalid or expired OTP');
    }
    const verified = await this.users.markVerified(identifier, this.channelFor(user, identifier));
    return this.session(verified ?? user);
  }

  /** Re-send an OTP (signup verification or OTP login) without enumeration. */
  async resendOtp(identifier: string): Promise<OtpResult> {
    const user = await this.users.findByIdentifier(identifier);
    if (!user) {
      // Same shape as success so the endpoint can't confirm which accounts exist.
      const channel: VerifyChannel = identifier.includes('@') ? 'email' : 'mobile';
      return { identifier, channel, sent: true };
    }
    return this.issueAndSend(identifier, this.channelFor(user, identifier));
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
    // Only issue and send a real code when the account exists; always answer
    // "sent" so the endpoint can't be used to enumerate registered users.
    if (!user) {
      const channel: VerifyChannel = identifier.includes('@') ? 'email' : 'mobile';
      return { identifier, channel, sent: true };
    }
    return this.issueAndSend(identifier, this.channelFor(user, identifier));
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
    const updated = await this.users.markVerified(identifier, this.channelFor(user, identifier));
    return this.session(updated ?? user);
  }
}
