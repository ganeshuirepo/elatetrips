/**
 * OTP delivery adapters (IOtpSender). One class per provider — console (dev),
 * Brevo (email), Twilio & Fast2SMS (SMS) — plus ChannelRoutingOtpSender, which
 * fans a code to the right provider by channel. buildOtpSender picks the
 * providers ONCE at startup from env, falling back to the console sender for any
 * channel with no provider configured, so the whole OTP flow works with zero
 * third-party accounts. A failed send throws 502 so the caller sees a real
 * error rather than a silently-undelivered code.
 */
import { env } from '../../config/env';
import { logger } from '../../common/logger';
import { AppError } from '../../common/errors/AppError';
import type { IOtpSender } from './auth.types';

type Channel = 'email' | 'mobile';

const OTP_MESSAGE = (code: string) =>
  `${code} is your ElateTrips verification code. It expires in 5 minutes. Do not share it with anyone.`;

/**
 * How long to wait on a provider before giving up. Without a cap, a provider
 * that accepts the connection and then stalls holds the traveller's sign-in
 * request open for as long as it likes — the request never returns, they retry,
 * and each retry pins another connection. Ten seconds is far longer than any
 * healthy send and short enough that a stall surfaces as an error someone can
 * act on. The code itself is already stored, so a timeout costs a resend, not
 * the sign-in.
 */
const SEND_TIMEOUT_MS = 10_000;

/**
 * fetch with a deadline, turning both a timeout and a dead host into the same
 * 502 the caller already handles. `provider` only names who was slow, so the
 * log says which account to go and look at.
 */
async function fetchWithTimeout(
  provider: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError'
      ? `did not answer within ${SEND_TIMEOUT_MS / 1000}s`
      : `could not be reached (${err instanceof Error ? err.message : String(err)})`;
    logger.error(`${provider} ${reason}`);
    throw new AppError(502, 'Could not send the OTP. Please try again.');
  }
}

/**
 * Dev fallback: prints the OTP to the server console instead of delivering it.
 * Active for any channel that has no provider configured, so the whole flow is
 * testable with zero third-party accounts.
 */
export class ConsoleOtpSender implements IOtpSender {
  async send(channel: Channel, identifier: string, code: string): Promise<void> {
    logger.info(`[OTP] ${channel} → ${identifier}: ${code}`);
  }
}

/**
 * Email OTP via Brevo's transactional API (free tier: 300 emails/day, no
 * credit card). Configure BREVO_API_KEY + BREVO_FROM_EMAIL.
 */
export class BrevoEmailOtpSender implements IOtpSender {
  async send(_channel: Channel, email: string, code: string): Promise<void> {
    const res = await fetchWithTimeout('Brevo', 'https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.brevoApiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: env.brevoFromEmail, name: env.brevoFromName },
        to: [{ email }],
        subject: `${code} is your ElateTrips verification code`,
        htmlContent: `<div style="font-family:sans-serif;max-width:420px">
            <h2 style="color:#0b3d3a">ElateTrips</h2>
            <p>Your one-time verification code is</p>
            <p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#0b3d3a">${code}</p>
            <p style="color:#666">It expires in 5 minutes. If you didn't request this, ignore this email.</p>
          </div>`,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error(`Brevo send failed (${res.status}): ${body}`);
      // Brevo answers 401 for BOTH a bad key and a key used from an
      // un-authorised IP, and the second is what bites on every new server: the
      // key is perfectly valid, it just has not been told about this machine.
      // Without naming it, the only clue is a generic "could not send".
      if (res.status === 401 && body.includes('unrecognised IP address')) {
        logger.error(
          "The Brevo key is valid but this server's IP is not authorised. Add it at " +
          'https://app.brevo.com/security/authorised_ips (or disable the IP restriction) ' +
          'before turning AUTH_AUTO_ACTIVATE off.',
        );
      }
      throw new AppError(502, 'Could not send the OTP email. Please try again.');
    }
  }
}

/**
 * SMS OTP via Twilio (trial: free credit, but only sends to numbers verified
 * in the Twilio console). Configure TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER.
 */
export class TwilioSmsOtpSender implements IOtpSender {
  async send(_channel: Channel, phone: string, code: string): Promise<void> {
    const auth = Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString('base64');
    const res = await fetchWithTimeout(
      'Twilio',
      `https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: `+91${phone}`,
          From: env.twilioFromNumber,
          Body: OTP_MESSAGE(code),
        }),
      },
    );
    if (!res.ok) {
      logger.error(`Twilio send failed (${res.status}): ${await res.text()}`);
      throw new AppError(502, 'Could not send the OTP SMS. Please try again.');
    }
  }
}

/**
 * SMS OTP via Fast2SMS (India; ₹50 free signup credit, and the dedicated OTP
 * route works without DLT registration). Configure FAST2SMS_API_KEY.
 */
export class Fast2SmsOtpSender implements IOtpSender {
  async send(_channel: Channel, phone: string, code: string): Promise<void> {
    const res = await fetchWithTimeout('Fast2SMS', 'https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: { authorization: env.fast2smsApiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ route: 'otp', variables_values: code, numbers: phone }),
    });
    const payload = (await res.json().catch(() => null)) as { return?: boolean } | null;
    if (!res.ok || payload?.return !== true) {
      logger.error(`Fast2SMS send failed (${res.status}):`, payload);
      throw new AppError(502, 'Could not send the OTP SMS. Please try again.');
    }
  }
}

/**
 * Routes each OTP to the configured provider for its channel, falling back to
 * the console sender when a channel has no provider set up. Selection happens
 * once at startup (composition root calls buildOtpSender).
 */
export class ChannelRoutingOtpSender implements IOtpSender {
  constructor(
    private readonly email: IOtpSender,
    private readonly sms: IOtpSender,
  ) {}

  async send(channel: Channel, identifier: string, code: string): Promise<void> {
    const sender = channel === 'email' ? this.email : this.sms;
    await sender.send(channel, identifier, code);
  }
}

export function buildOtpSender(): IOtpSender {
  const console = new ConsoleOtpSender();

  const email = env.brevoApiKey && env.brevoFromEmail ? new BrevoEmailOtpSender() : console;
  const sms =
    env.twilioAccountSid && env.twilioAuthToken && env.twilioFromNumber
      ? new TwilioSmsOtpSender()
      : env.fast2smsApiKey
        ? new Fast2SmsOtpSender()
        : console;

  logger.info(
    `OTP senders — email: ${email.constructor.name}, sms: ${sms.constructor.name}`,
  );
  if (env.isProd && (email === console || sms === console)) {
    logger.warn('OTP provider missing in production — codes will only appear in server logs.');
  }
  return new ChannelRoutingOtpSender(email, sms);
}
