/**
 * ChannelProvider — the seam between the comms service and the outside world
 * (FR4.1/4.3/4.6/4.7). Every real integration (Brevo/SES email, Twilio/Exotel
 * SMS, Meta WhatsApp Cloud API, a TTS/IVR voice vendor) implements this ONE
 * interface. The service depends on the interface, never a concrete SDK, so a
 * provider is a config-selected swap in the composition root (BR-17, DIP).
 *
 * Only the stub ships now. It logs and acknowledges — no creds, no network, no
 * dependency. It is the default wired in container.ts; real providers arrive
 * later, entirely additively, with no change to the service.
 */
import { randomBytes } from 'node:crypto';
import { logger } from '../../common/logger';
import type { Channel, SendRequest, SendResult } from './comms.types';

export interface ChannelProvider {
  /** Channels this provider can transmit on. */
  readonly channels: readonly Channel[];
  /** Attempt a send. Must resolve (never throw) for a transient failure —
   *  return `{ ok:false, error }` so the ladder can decide what to do next. */
  send(req: SendRequest): Promise<SendResult>;
}

/**
 * No-op / logging provider. Accepts every channel, transmits nothing, and mints
 * a local `stub-…` message id so the delivery log and correlation still work in
 * dev, tests, and fixture runs.
 */
export class StubChannelProvider implements ChannelProvider {
  readonly channels: readonly Channel[] = ['in_app', 'email', 'sms', 'whatsapp', 'voice'];

  async send(req: SendRequest): Promise<SendResult> {
    const provider_message_id = `stub-${req.channel}-${randomBytes(6).toString('hex')}`;
    logger.info(
      `[comms:stub] would send ${req.channel} to ${req.recipient.recipient_id}` +
        (req.rfq_id ? ` (rfq ${req.rfq_id})` : '') +
        `${req.message.subject ? ` — "${req.message.subject}"` : ''}`,
    );
    return {
      ok: true,
      channel: req.channel,
      provider_message_id,
      accepted_ts: new Date().toISOString(),
    };
  }
}
