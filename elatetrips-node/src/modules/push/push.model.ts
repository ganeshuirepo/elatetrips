import { Schema, model } from 'mongoose';

/** One registered device. `owner` is a phone (scope 'user') or a console username. */
export interface PushToken {
  token: string;
  platform: 'android' | 'ios';
  scope: 'user' | 'console';
  owner: string;
  createdAt: string;
}

const pushTokenSchema = new Schema<PushToken>(
  {
    token: { type: String, required: true, unique: true },
    platform: { type: String, required: true },
    scope: { type: String, required: true, index: true },
    owner: { type: String, required: true, index: true },
    createdAt: { type: String, required: true },
  },
  { versionKey: false, strict: true },
);

export const PushTokenModel = model<PushToken>('push_token', pushTokenSchema);
