/**
 * M4 — Communication Service: shared types (BRD §M4, FR4.1–FR4.8).
 *
 * The one outbound/inbound messaging surface. No other module talks to a
 * provider directly — they call the CommsService, which fans out over a
 * ChannelProvider. Everything business-shaped (channel order, ladder cadence,
 * token TTL, quiet hours, voice caps) is CONFIG, never a literal here (BR-17).
 */

/** Delivery channels the ladder can fire, in BR-12 escalation family. */
export type Channel = 'in_app' | 'email' | 'sms' | 'whatsapp' | 'voice';

/** Per-purpose sender identity (FR4.1 — reuse the multi-ID Brevo setup). */
export type SenderIdentity = 'rfq' | 'onboarding' | 'follow_up' | 'marketing';

/**
 * A recipient's per-channel consent (mirrors Supplier.comms_consent in the
 * frozen contract). WhatsApp/voice require an explicit opt-in (BR-2, FR3.10);
 * an opt-out on the permanent registry overrides all of these.
 */
export interface ConsentFlags {
  in_app?: boolean;
  email?: boolean;
  sms?: boolean;
  whatsapp?: boolean;
  voice?: boolean;
}

/** Where a message is addressed. Recipient id binds magic-link tokens (BR-15). */
export interface Recipient {
  recipient_id: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  consent?: ConsentFlags;
}

/** A rendered message, provider-agnostic. */
export interface RenderedMessage {
  channel: Channel;
  subject?: string;
  body: string;
  /** WhatsApp/SMS carry the short (magic) link; voice carries a spoken script. */
  short_link?: string;
  /** Free-form structured data a real provider template maps its variables to. */
  variables?: Record<string, unknown>;
}

/** What the service hands a provider to actually transmit. */
export interface SendRequest {
  channel: Channel;
  recipient: Recipient;
  message: RenderedMessage;
  sender?: SenderIdentity;
  /** Correlation for the audit/delivery log and inbound reply routing. */
  rfq_id?: string;
  purpose?: string;
}

/** A provider's synchronous acknowledgement of a send attempt. */
export interface SendResult {
  ok: boolean;
  channel: Channel;
  /** Provider message handle (stub mints a deterministic-ish local id). */
  provider_message_id: string;
  /** Set when ok=false — never throws for a transient provider failure. */
  error?: string;
  accepted_ts: string;
}

/**
 * Provider-level delivery telemetry (FR4.5 — delivery/open/click to the audit
 * stream). Kept as the module's own event kind because the frozen event catalog
 * (`/contracts/events.md`) has no comm.* type and adding one is a contracts
 * change (owner-only). `link.opened` is the one catalog event this maps onto.
 */
export type DeliveryState = 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'failed' | 'bounced';

export interface DeliveryEvent {
  event_id: string;
  provider_message_id: string;
  channel: Channel;
  state: DeliveryState;
  recipient_id: string;
  rfq_id?: string;
  ts: string;
  detail?: string;
}

/** Raw inbound message captured for the M7 parser (FR4.2). */
export interface InboundMessage {
  inbound_id: string;
  channel: Channel;
  from: string;
  /** `rfq-{id}@quotes.…` reply-to → the RFQ this belongs to. */
  rfq_id?: string;
  subject?: string;
  raw: string;
  received_ts: string;
}

/** Voice-call outcome recorded against the RFQ (FR4.7). */
export type VoiceOutcome = 'will_quote' | 'cannot_service' | 'call_me_back' | 'no_answer';

// ---- Magic-link tokens (FR4.4, BR-15) -------------------------------------

/** The signed, single-RFQ-scoped, recipient-bound claims inside a token. */
export interface MagicLinkClaims {
  rfq_id: string;
  /** Recipient binding (BR-15) — a token is useless to anyone else. */
  recipient_id: string;
  purpose: string;
  /** Epoch millis; the token is rejected at/after this instant. */
  exp: number;
  /** Random per-mint nonce so two mints never collide. */
  nonce: string;
}

export type VerifyResult =
  | { valid: true; claims: MagicLinkClaims }
  | { valid: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'wrong_recipient' | 'wrong_rfq' };

// ---- Communication ladder (FR4.8, BR-12) ----------------------------------

/**
 * One rung of the graded ladder. Ordered, fired sequentially, NEVER in parallel
 * (FR4.8). All values come from config (BR-17); a rung ships with none of them
 * baked in.
 */
export interface LadderRung {
  channel: Channel;
  /** When this rung becomes eligible, measured from dispatch. */
  after_hours?: number;
  after_minutes?: number;
  /** Voice rung caps (FR4.7): repeats + spacing, both from config. */
  max_attempts?: number;
  spacing_minutes?: number;
  /** Whether quiet hours suppress this rung (voice: true). */
  respect_quiet_hours?: boolean;
}

/** Quiet-hours window (FR4.7 — 21:00–08:00 IST as config, not a literal). */
export interface QuietHours {
  start_hour: number;
  end_hour: number;
  /** IANA-ish label for documentation; math is done on the supplied clock. */
  tz_label?: string;
}

/** Live ladder state the pure next-step function reasons over. */
export interface LadderState {
  /** Count of rungs already fired, in order — the next rung is rungs[fired]. */
  fired_rungs: number;
  /** Voice attempts already placed (for the voice rung's cap). */
  voice_attempts: number;
  /** Any engagement signal cancels the whole ladder (FR4.7/FR4.8). */
  engaged: boolean;
  /** Permanent opt-out or withdrawn consent. */
  opted_out: boolean;
  consent: ConsentFlags;
}

export interface LadderDecisionInput {
  rungs: LadderRung[];
  state: LadderState;
  /** Minutes elapsed since dispatch. */
  elapsed_minutes: number;
  /** Minutes since the last voice attempt (for spacing); undefined if none. */
  minutes_since_last_voice?: number;
  quiet_hours?: QuietHours;
  now: Date;
}

export type LadderDecision =
  | { action: 'send'; rung: LadderRung; rung_index: number; reason: string }
  | { action: 'wait'; until_minutes: number; reason: string }
  | { action: 'skip'; rung_index: number; reason: string }
  | { action: 'cancel'; reason: string }
  | { action: 'done'; reason: string };
