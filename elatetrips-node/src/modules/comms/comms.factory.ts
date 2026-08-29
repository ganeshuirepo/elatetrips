/**
 * Chooses the ChannelProvider(s) at startup — the one place that knows which
 * real integrations exist. Lives apart from comms.provider.ts so the interface
 * file stays free of concrete SDK imports (and free of an import cycle).
 *
 * Today: SMTP for email when the mailbox is configured, the logging stub for
 * everything else. WhatsApp/SMS/voice become extra entries in the same routing
 * table, and nothing above this file changes when they do.
 */
import { logger } from '../../common/logger';
import { StubChannelProvider, type ChannelProvider } from './comms.provider';
import { SmtpChannelProvider, loadSmtpConfig, missingSmtpKeys, type ConfigSource } from './comms.smtp';
import type { Channel, SendRequest, SendResult } from './comms.types';

/**
 * Routes each channel to whichever provider claims it, falling back to the
 * stub. This is what lets email be real while WhatsApp is still a log line —
 * the alternative, one provider per deployment, would mean no email until every
 * channel is live.
 */
export class CompositeChannelProvider implements ChannelProvider {
  readonly channels: readonly Channel[] = ['in_app', 'email', 'sms', 'whatsapp', 'voice'];

  private readonly routes = new Map<Channel, ChannelProvider>();
  private readonly fallback: ChannelProvider;

  constructor(providers: readonly ChannelProvider[], fallback: ChannelProvider = new StubChannelProvider()) {
    this.fallback = fallback;
    // Last registration wins, so a caller can override a channel by appending.
    for (const p of providers) for (const c of p.channels) this.routes.set(c, p);
  }

  /** Which provider actually handles a channel — used by the startup log. */
  providerFor(channel: Channel): ChannelProvider {
    return this.routes.get(channel) ?? this.fallback;
  }

  async send(req: SendRequest): Promise<SendResult> {
    return this.providerFor(req.channel).send(req);
  }
}

export interface BuiltProvider {
  provider: ChannelProvider;
  /** Channels backed by a real integration — the rest are logged, not sent. */
  live: Channel[];
}

export function buildChannelProvider(source?: ConfigSource): BuiltProvider {
  const smtp = loadSmtpConfig(source);
  if (!smtp) {
    const missing = missingSmtpKeys(source);
    logger.warn(
      `[comms] email is NOT live — set ${missing.join(', ')} to send. Messages will be logged only.`,
    );
    return { provider: new StubChannelProvider(), live: [] };
  }

  logger.info(
    `[comms] email live via ${smtp.host}:${smtp.port} as ${smtp.from}` +
      // Worth shouting about: a deployment that thinks it is mailing suppliers
      // and is quietly mailing one test inbox is the failure you find late.
      (smtp.test_recipient ? ` — ALL MAIL DIVERTED TO ${smtp.test_recipient}` : ''),
  );
  return {
    provider: new CompositeChannelProvider([new SmtpChannelProvider({ config: smtp })]),
    live: ['email'],
  };
}
