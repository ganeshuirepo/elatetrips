import type { IUserRepository } from './user.repository';
import { NotFoundError } from '../../common/errors/AppError';
import type { User, ProfileUpdate } from './user.types';

/** Profile use cases. Depends only on the repository abstraction. */
export class UserService {
  constructor(private readonly users: IUserRepository) {}

  async getProfile(phone: string): Promise<User> {
    const user = await this.users.ensure(phone);
    return user;
  }

  async updateProfile(phone: string, update: ProfileUpdate): Promise<User> {
    await this.users.ensure(phone);
    const updated = await this.users.updateProfile(phone, update);
    if (!updated) throw new NotFoundError(`User not found: ${phone}`);
    return updated;
  }
}
