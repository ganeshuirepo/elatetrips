/**
 * SmtpChannelProvider — the first REAL ChannelProvider (FR4.1). It implements
 * the same one-method interface as StubChannelProvider, so the CommsService,
 * the ladder and every caller are unchanged: this is a composition-root swap,
 * not a rewrite (DIP, BR-17).
 *
 * Why SMTP and not the Brevo API the OTP sender uses: WhatsApp is the intended
 * primary channel for supplier RFQs and its BSP onboarding is still in flight,
 * so email carries the whole workflow in the meantime. The Workspace mailbox
 * behind `connect@elatetrips.com` is already warmed and sending (it is what the
 * partner-outreach tool uses), which makes it the one path we know lands in an
 * inbox today. Nothing here is email-specific to the service above it — when
 * WhatsApp arrives it is another provider beside this one.
 *
 * Config (env, never literals here):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS   the mailbox
 *   MAIL_FROM, MAIL_REPLY_TO                     what the recipient sees
 *   COMM_TEST_RECIPIENT                          see the redirect note below
 */
import { createTransport, type Transporter } from 'nodemailer';
import { logger } from '../../common/logger';
import type { ChannelProvider } from './comms.provider';
import type { Channel, SendRequest, SendResult } from './comms.types';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** Envelope sender, e.g. `Elate Trips <connect@elatetrips.com>`. */
  from: string;
  /** Where replies go; falls back to `from`. Supplier quotes arrive as replies. */
  reply_to?: string;
  /**
   * DIVERT EVERY MESSAGE HERE. While the supplier directory holds no verified
   * addresses, a live RFQ dispatch would otherwise mail real businesses from a
   * half-built workflow. With this set, the workflow runs end to end — same
   * templates, same links, same delivery log — and lands in one test inbox,
   * with the address it WOULD have gone to preserved in the subject and an
   * `X-Elate-Intended-To` header, so a dispatch of five is still five
   * distinguishable mails. Unset it only when the directory is real.
   */
  test_recipient?: string;
}

const KEYS = {
  host: 'SMTP_HOST',
  port: 'SMTP_PORT',
  user: 'SMTP_USER',
  pass: 'SMTP_PASS',
  from: 'MAIL_FROM',
  replyTo: 'MAIL_REPLY_TO',
  testRecipient: 'COMM_TEST_RECIPIENT',
} as const;

export type ConfigSource = Record<string, string | undefined>;

const str = (src: ConfigSource, key: string): string => (src[key] ?? '').trim();

/** Reads SMTP settings from env. Returns null when the mailbox is not configured. */
export function loadSmtpConfig(source?: ConfigSource): SmtpConfig | null {
  const src: ConfigSource = source ?? process.env;
  const host = str(src, KEYS.host);
  const user = str(src, KEYS.user);
  const pass = str(src, KEYS.pass);
  const from = str(src, KEYS.from);
  // All four are load-bearing. A partial config is a misconfiguration, not a
  // degraded mode: silently falling back to the stub would look like success.
  if (!host || !user || !pass || !from) return null;

  const portRaw = parseInt(str(src, KEYS.port), 10);
  return {
    host,
    user,
    pass,
    from,
    // 587 is the submission port every provider offers; 465 is implicit TLS.
    port: Number.isFinite(portRaw) ? portRaw : 587,
    reply_to: str(src, KEYS.replyTo) || undefined,
    test_recipient: str(src, KEYS.testRecipient) || undefined,
  };
}

/** Which env keys are missing — for a startup log that names the actual gap. */
export function missingSmtpKeys(source?: ConfigSource): string[] {
  const src: ConfigSource = source ?? process.env;
  return [KEYS.host, KEYS.user, KEYS.pass, KEYS.from].filter((k) => !str(src, k));
}

export const SMTP_CONFIG_KEYS = KEYS;

/** A plain-text fallback so the mail is readable where HTML is not rendered. */
export function htmlToText(html: string): string {
  return html
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2: $1')
    .replace(/<\/(p|div|h\d|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface SmtpProviderDeps {
  config: SmtpConfig;
  /** Injected in tests so nothing opens a socket. */
  transport?: Transporter;
}

export class SmtpChannelProvider implements ChannelProvider {
  readonly channels: readonly Channel[] = ['email'];

  private readonly config: SmtpConfig;
  private transport: Transporter | undefined;

  constructor(deps: SmtpProviderDeps) {
    this.config = deps.config;
    this.transport = deps.transport;
  }

  /** Built on first use and pooled: a wave is several mails back to back. */
  private conn(): Transporter {
    if (!this.transport) {
      this.transport = createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.port === 465,
        auth: { user: this.config.user, pass: this.config.pass },
        pool: true,
        // One connection, paced: this is a supplier wave, not a campaign, and
        // a burst from a warmed Workspace mailbox is what gets it rate-limited.
        maxConnections: 1,
        maxMessages: 50,
      });
    }
    return this.transport;
  }

  async close(): Promise<void> {
    this.transport?.close();
    this.transport = undefined;
  }

  /**
   * Never throws. The ChannelProvider contract is that a transient failure comes
   * back as `{ ok:false, error }` so the ladder can decide to retry or escalate;
   * throwing here would turn one refused recipient into a failed dispatch.
   */
  async send(req: SendRequest): Promise<SendResult> {
    const accepted_ts = new Date().toISOString();
    const fail = (error: string): SendResult => ({
      ok: false,
      channel: req.channel,
      provider_message_id: '',
      error,
      accepted_ts,
    });

    if (req.channel !== 'email') return fail(`SmtpChannelProvider cannot send on ${req.channel}`);

    const intended = (req.recipient.email ?? '').trim();
    if (!intended) return fail(`No email address for recipient ${req.recipient.recipient_id}`);

    const redirected = this.config.test_recipient !== undefined;
    const to = redirected ? this.config.test_recipient : intended;
    const subject = req.message.subject ?? '';

    const html = req.message.body;
    try {
      const info = await this.conn().sendMail({
        from: this.config.from,
        to,
        replyTo: this.config.reply_to ?? this.config.from,
        // The real destination stays visible on a diverted mail; without it a
        // five-supplier wave is five identical-looking messages in one inbox.
        subject: redirected ? `[test to ${intended}] ${subject}` : subject,
        html,
        text: htmlToText(html),
        headers: {
          'X-Elate-Intended-To': intended,
          ...(req.rfq_id ? { 'X-Elate-Rfq-Id': req.rfq_id } : {}),
          ...(req.purpose ? { 'X-Elate-Purpose': req.purpose } : {}),
        },
      });
      logger.info(
        `[comms:smtp] sent "${subject}" to ${to}` +
          (redirected ? ` (diverted from ${intended})` : '') +
          (req.rfq_id ? ` [rfq ${req.rfq_id}]` : ''),
      );
      return { ok: true, channel: 'email', provider_message_id: info.messageId, accepted_ts };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error(`[comms:smtp] send to ${to} failed: ${error}`);
      return fail(error);
    }
  }
}
