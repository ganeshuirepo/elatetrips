import { Schema, model } from 'mongoose';

export const PUSH_PLATFORMS = ['android', 'ios'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** Which audience a token belongs to — they are notified by different code. */
export const PUSH_SCOPES = ['user', 'console'] as const;
export type PushScope = (typeof PUSH_SCOPES)[number];

/** One registered device. `owner` is a phone (scope 'user') or a console username. */
export interface PushToken {
  token: string;
  platform: PushPlatform;
  scope: PushScope;
  owner: string;
  createdAt: string;
}

const pushTokenSchema = new Schema<PushToken>(
  {
    token: { type: String, required: true, unique: true },
    // Both drive delivery: platform picks FCM vs APNs, scope picks the
    // audience. A token stored under an unknown value is simply never sent to.
    platform: { type: String, required: true, enum: PUSH_PLATFORMS },
    scope: { type: String, required: true, enum: PUSH_SCOPES, index: true },
    owner: { type: String, required: true, index: true },
    createdAt: { type: String, required: true },
  },
  { versionKey: false, strict: true },
);

export const PushTokenModel = model<PushToken>('push_token', pushTokenSchema);
