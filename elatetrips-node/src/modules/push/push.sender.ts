import { logger } from '../../common/logger';

export interface PushMessage {
  title: string;
  body: string;
  /** Deep-link route the app opens on tap, e.g. `/trips/ELT-1/chat`. */
  data: Record<string, string>;
}

/**
 * Delivery port. Console logging is the mock-first default; an FCM HTTP v1
 * adapter implements this same port once a Firebase service account exists
 * (env FCM_SERVICE_ACCOUNT_JSON) — nothing upstream changes.
 */
export interface IPushSender {
  send(tokens: string[], message: PushMessage): Promise<void>;
}

export class ConsolePushSender implements IPushSender {
  async send(tokens: string[], message: PushMessage): Promise<void> {
    if (tokens.length === 0) return;
    logger.info(
      `[push] ${message.title} — ${message.body} → ${tokens.length} device(s) ` +
        `(${message.data.route ?? ''})`,
    );
  }
}
