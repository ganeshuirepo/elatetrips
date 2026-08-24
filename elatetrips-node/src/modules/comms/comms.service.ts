/**
 * CommsService — the one messaging use-case layer (BRD §M4). Every other module
 * (M5 broadcast, M8 booking, M9 fulfilment) sends through here; none touches a
 * provider directly. It composes the pure pieces — templates, tokens, ladder —
 * with an injected ChannelProvider and audit sink, so it is testable with fakes
 * and swaps a real provider by one line in the composition root (DIP, BR-17).
 *
 * Responsibilities:
 *   • enforce consent + permanent opt-out before any transmit (BR-2, FR4.7);
 *   • render a versioned template and (when needed) mint a recipient-bound,
 *     single-RFQ, expiring magic link (FR4.4, BR-15);
 *   • hand the message to the provider and log delivery telemetry (FR4.5);
 *   • capture inbound for the M7 parser (FR4.2);
 *   • expose the pure ladder decision (FR4.8) and record voice outcomes (FR4.7).
 */
import { randomBytes } from 'node:crypto';
import { BadRequestError, ForbiddenError } from '../../common/errors/AppError';
import type { CommsConfig } from './comms.config';
import type { CommsAuditSink } from './comms.audit';
import type { ChannelProvider } from './comms.provider';
import { mintMagicLink, verifyMagicLink } from './comms.tokens';
import { renderTemplate, type TemplateId } from './comms.templates';
import { nextLadderStep } from './comms.ladder';
import type {
  Channel,
  ConsentFlags,
  DeliveryEvent,
  DeliveryState,
  InboundMessage,
  LadderDecision,
  LadderDecisionInput,
  MagicLinkClaims,
  Recipient,
  RenderedMessage,
  SendRequest,
  SendResult,
  VerifyResult,
  VoiceOutcome,
} from './comms.types';

export interface CommsServiceDeps {
  provider: ChannelProvider;
  sink: CommsAuditSink;
  config: CommsConfig;
  /** Injected clock keeps token/ladder behaviour deterministic in tests. */
  now?: () => Date;
}

export interface SendTemplateInput {
  templateId: TemplateId;
  channel: Channel;
  recipient: Recipient;
  data?: Record<string, unknown>;
  rfq_id?: string;
  /** When set, a magic link is minted and injected as `short_link`. */
  mint_link_purpose?: string;
  version?: number;
}

export class CommsService {
  private readonly provider: ChannelProvider;
  private readonly sink: CommsAuditSink;
  private readonly config: CommsConfig;
  private readonly now: () => Date;
  /** Permanent opt-out registry (FR4.7 — honoured forever, in-memory here). */
  private readonly optedOut = new Set<string>();
  private counter = 0;

  constructor(deps: CommsServiceDeps) {
    this.provider = deps.provider;
    this.sink = deps.sink;
    this.config = deps.config;
    this.now = deps.now ?? ((): Date => new Date());
  }

  private eventId(): string {
    this.counter += 1;
    return `cev_${Date.now().toString(36)}_${this.counter.toString(36)}_${randomBytes(3).toString('hex')}`;
  }

  private iso(): string {
    return this.now().toISOString();
  }

  // ---- Consent & opt-out ---------------------------------------------------

  /** Records a permanent opt-out (FR4.7). Idempotent. */
  optOut(recipientId: string): void {
    this.optedOut.add(recipientId);
  }

  isOptedOut(recipientId: string): boolean {
    return this.optedOut.has(recipientId);
  }

  /** in_app is implicit; every other channel is opt-in (BR-2). */
  private hasConsent(channel: Channel, consent: ConsentFlags | undefined): boolean {
    const c = consent ?? {};
    if (channel === 'in_app') return c.in_app !== false;
    return c[channel] === true;
  }

  // ---- Sending -------------------------------------------------------------

  private recordDelivery(state: DeliveryState, req: SendRequest, providerMessageId: string, detail?: string): DeliveryEvent {
    return this.sink.recordDelivery({
      event_id: this.eventId(),
      provider_message_id: providerMessageId,
      channel: req.channel,
      state,
      recipient_id: req.recipient.recipient_id,
      rfq_id: req.rfq_id,
      ts: this.iso(),
      detail,
    });
  }

  /**
   * Low-level send. Enforces the compliance gates (opt-out, consent, enabled
   * channel) then hands off to the provider and logs the delivery attempt.
   * Throws AppError on a policy refusal so the API returns a clean 4xx; a
   * transient provider failure is logged as `failed` and returned, not thrown.
   */
  async send(req: SendRequest): Promise<SendResult> {
    if (this.isOptedOut(req.recipient.recipient_id)) {
      throw new ForbiddenError('Recipient has opted out of communications');
    }
    if (!this.config.enabled_channels.includes(req.channel)) {
      throw new BadRequestError(`Channel not enabled: ${req.channel}`);
    }
    if (!this.hasConsent(req.channel, req.recipient.consent)) {
      throw new ForbiddenError(`No consent for channel: ${req.channel}`);
    }

    const result = await this.provider.send(req);
    this.recordDelivery(result.ok ? 'sent' : 'failed', req, result.provider_message_id, result.error);
    return result;
  }

  /**
   * The common path: render a versioned template, optionally mint a magic link,
   * and send. This is what `POST /comm/send` and the ladder driver both call.
   */
  async sendTemplated(input: SendTemplateInput): Promise<SendResult> {
    const data: Record<string, unknown> = { ...(input.data ?? {}) };

    if (input.mint_link_purpose) {
      if (!input.rfq_id) throw new BadRequestError('rfq_id is required to mint a magic link');
      const { token } = this.mintLink(input.rfq_id, input.recipient.recipient_id, input.mint_link_purpose);
      data.short_link = token;
    }

    const message: RenderedMessage = renderTemplate({
      id: input.templateId,
      channel: input.channel,
      data,
      version: input.version,
    });

    return this.send({
      channel: input.channel,
      recipient: input.recipient,
      message,
      rfq_id: input.rfq_id,
      purpose: input.mint_link_purpose ?? input.templateId,
    });
  }

  // ---- Magic links (FR4.4, BR-15) -----------------------------------------

  mintLink(rfqId: string, recipientId: string, purpose: string): { token: string; claims: MagicLinkClaims } {
    return mintMagicLink({ rfq_id: rfqId, recipient_id: recipientId, purpose, now: this.now(), config: this.config });
  }

  /**
   * Verifies a magic link and, on success, records the open against the RFQ —
   * this is the FR4.5 open/click signal and the `link.opened` moment (BR-15)
   * that also cancels the ladder for that recipient.
   */
  verifyLink(token: string, expect?: { rfq_id?: string; recipient_id?: string }): VerifyResult {
    const result = verifyMagicLink({
      token,
      now: this.now(),
      config: this.config,
      expect_rfq_id: expect?.rfq_id,
      expect_recipient_id: expect?.recipient_id,
    });
    if (result.valid) {
      this.sink.recordDelivery({
        event_id: this.eventId(),
        provider_message_id: `link-${result.claims.nonce}`,
        channel: 'in_app',
        state: 'opened',
        recipient_id: result.claims.recipient_id,
        rfq_id: result.claims.rfq_id,
        ts: this.iso(),
        detail: `magic_link_opened:${result.claims.purpose}`,
      });
    }
    return result;
  }

  // ---- Delivery webhooks (FR4.5) ------------------------------------------

  /** Provider callback → append a delivery/open/click/bounce event. */
  ingestDeliveryStatus(input: {
    provider_message_id: string;
    channel: Channel;
    state: DeliveryState;
    recipient_id: string;
    rfq_id?: string;
    detail?: string;
  }): DeliveryEvent {
    return this.sink.recordDelivery({ event_id: this.eventId(), ts: this.iso(), ...input });
  }

  // ---- Inbound capture (FR4.2) --------------------------------------------

  /** Store a raw inbound message and route it to the M7 parser queue. */
  captureInbound(input: { channel: Channel; from: string; rfq_id?: string; subject?: string; raw: string }): InboundMessage {
    return this.sink.recordInbound({
      inbound_id: `in_${this.eventId()}`,
      channel: input.channel,
      from: input.from,
      rfq_id: input.rfq_id,
      subject: input.subject,
      raw: input.raw,
      received_ts: this.iso(),
    });
  }

  // ---- Ladder (FR4.8) ------------------------------------------------------

  /** Pure next-step decision over the CONFIGURED ladder (defaults to config). */
  nextLadderStep(input: Omit<LadderDecisionInput, 'rungs' | 'quiet_hours' | 'now'> & Partial<Pick<LadderDecisionInput, 'rungs' | 'quiet_hours' | 'now'>>): LadderDecision {
    return nextLadderStep({
      rungs: input.rungs ?? this.config.ladder,
      quiet_hours: input.quiet_hours ?? this.config.quiet_hours,
      now: input.now ?? this.now(),
      state: input.state,
      elapsed_minutes: input.elapsed_minutes,
      minutes_since_last_voice: input.minutes_since_last_voice,
    });
  }

  // ---- Voice outcomes (FR4.7) ---------------------------------------------

  /** Records a voice-call outcome against the RFQ as delivery telemetry. */
  recordVoiceOutcome(input: { provider_message_id: string; recipient_id: string; rfq_id?: string; outcome: VoiceOutcome; cost_minor?: number }): DeliveryEvent {
    return this.sink.recordDelivery({
      event_id: this.eventId(),
      provider_message_id: input.provider_message_id,
      channel: 'voice',
      state: 'delivered',
      recipient_id: input.recipient_id,
      rfq_id: input.rfq_id,
      ts: this.iso(),
      detail: `voice_outcome:${input.outcome}${input.cost_minor !== undefined ? `;cost_minor=${input.cost_minor}` : ''}`,
    });
  }

  // ---- Reads ---------------------------------------------------------------

  deliveriesFor(rfqId: string): DeliveryEvent[] {
    return this.sink.deliveriesFor(rfqId);
  }

  inboundFor(rfqId: string): InboundMessage[] {
    return this.sink.inboundFor(rfqId);
  }
}
