import { UserModel } from './user.model';
import type {
  User,
  UserWithSecret,
  ProfileUpdate,
  SignupData,
  VerifyChannel,
} from './user.types';

/** Persistence contract for users (Interface Segregation: only what's needed). */
export interface IUserRepository {
  findByPhone(phone: string): Promise<User | null>;
  /** Find by email OR phone (used for password login / reset). */
  findByIdentifier(identifier: string): Promise<User | null>;
  /** Same lookup but including the password hash, for credential checks only. */
  findCredentials(identifier: string): Promise<UserWithSecret | null>;
  /** Create a passwordless, active account (OTP login) if absent. */
  ensure(phone: string): Promise<User>;
  /** Create a pending account from signup data + a hashed password. */
  createPending(data: SignupData, passwordHash: string): Promise<User>;
  /** Replace a still-pending signup for the same phone (re-registration). */
  updatePending(data: SignupData, passwordHash: string): Promise<User | null>;
  /** Mark a verification channel confirmed and activate the account. */
  markVerified(identifier: string, channel: VerifyChannel): Promise<User | null>;
  setPassword(identifier: string, passwordHash: string): Promise<User | null>;
  updateProfile(phone: string, update: ProfileUpdate): Promise<User | null>;
}

const publicProjection = '-_id -__v -passwordHash';
const identifierQuery = (id: string) => ({ $or: [{ email: id }, { phone: id }] });

export class UserRepository implements IUserRepository {
  async findByPhone(phone: string): Promise<User | null> {
    return UserModel.findOne({ phone }).select(publicProjection).lean<User>().exec();
  }

  async findByIdentifier(identifier: string): Promise<User | null> {
    return UserModel.findOne(identifierQuery(identifier)).select(publicProjection).lean<User>().exec();
  }

  async findCredentials(identifier: string): Promise<UserWithSecret | null> {
    return UserModel.findOne(identifierQuery(identifier))
      .select('-_id -__v +passwordHash')
      .lean<UserWithSecret>()
      .exec();
  }

  async ensure(phone: string): Promise<User> {
    return UserModel.findOneAndUpdate(
      { phone },
      { $setOnInsert: { phone, status: 'active', mobileVerified: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
      .select(publicProjection)
      .lean<User>()
      .exec();
  }

  async createPending(data: SignupData, passwordHash: string): Promise<User> {
    const doc = await UserModel.create({
      phone: data.phone,
      email: data.email,
      name: data.name,
      gender: data.gender,
      age: data.age,
      passwordHash,
      status: 'pending',
      emailVerified: false,
      mobileVerified: false,
    });
    const obj = doc.toObject({ versionKey: false }) as Record<string, unknown>;
    delete obj._id;
    delete obj.passwordHash;
    return obj as unknown as User;
  }

  async updatePending(data: SignupData, passwordHash: string): Promise<User | null> {
    return UserModel.findOneAndUpdate(
      { phone: data.phone, status: 'pending' },
      {
        $set: {
          email: data.email,
          name: data.name,
          gender: data.gender,
          age: data.age,
          passwordHash,
          emailVerified: false,
          mobileVerified: false,
        },
      },
      { new: true },
    )
      .select(publicProjection)
      .lean<User>()
      .exec();
  }

  async markVerified(identifier: string, channel: VerifyChannel): Promise<User | null> {
    const field = channel === 'email' ? 'emailVerified' : 'mobileVerified';
    return UserModel.findOneAndUpdate(
      identifierQuery(identifier),
      { $set: { [field]: true, status: 'active' } },
      { new: true },
    )
      .select(publicProjection)
      .lean<User>()
      .exec();
  }

  async setPassword(identifier: string, passwordHash: string): Promise<User | null> {
    return UserModel.findOneAndUpdate(
      identifierQuery(identifier),
      { $set: { passwordHash } },
      { new: true },
    )
      .select(publicProjection)
      .lean<User>()
      .exec();
  }

  async updateProfile(phone: string, update: ProfileUpdate): Promise<User | null> {
    const set: Record<string, unknown> = {};
    if (update.name !== undefined) set.name = update.name;
    if (update.email !== undefined) set.email = update.email;
    if (update.billing) {
      for (const [k, v] of Object.entries(update.billing)) set[`billing.${k}`] = v;
    }
    return UserModel.findOneAndUpdate({ phone }, { $set: set }, { new: true })
      .select(publicProjection)
      .lean<User>()
      .exec();
  }
}
