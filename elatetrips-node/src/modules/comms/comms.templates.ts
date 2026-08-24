/**
 * Template registry (FR4.4). Email HTML + WhatsApp/SMS/voice templates live
 * in-repo, versioned, as a typed map — the technical half. The message CONTENT
 * (copy, brand, real HTML) is the functional half and arrives later as data; the
 * stubs here are minimal, deterministic, and variable-driven so nothing about a
 * given RFQ is baked in.
 *
 * A template is addressed by `{ id, version }`. `renderTemplate` interpolates
 * `{{var}}` placeholders from the supplied data and returns a channel-tagged
 * RenderedMessage. Unknown placeholders render empty rather than leaking braces.
 */
import type { Channel, RenderedMessage } from './comms.types';

/** Every template id the platform can address (matches FR4.6 SMS set + FR4.3 WA). */
export type TemplateId =
  | 'rfq_dispatch'
  | 'rfq_reminder'
  | 'enrichment_request'
  | 'reconfirmation'
  | 'job_card_issue'
  | 'follow_up_notice'
  | 'otp';

export interface TemplateDef {
  id: TemplateId;
  version: number;
  channel: Channel;
  /** Email subject line (email only); other channels ignore it. */
  subject?: string;
  /** Body with `{{placeholder}}` slots. */
  body: string;
  /** Whether the rendered message should carry the magic short link. */
  carries_link?: boolean;
}

export type TemplateKey = `${TemplateId}:${Channel}`;

const key = (id: TemplateId, channel: Channel): TemplateKey => `${id}:${channel}`;

/**
 * The registry. Kept intentionally spare — real approved copy (DLT-registered
 * SMS, BSP-approved WA templates, branded email HTML) replaces these bodies as
 * config/content without any code change. Versions start at 1.
 */
const REGISTRY: Partial<Record<TemplateKey, TemplateDef>> = {
  [key('rfq_dispatch', 'email')]: {
    id: 'rfq_dispatch',
    version: 1,
    channel: 'email',
    subject: 'New RFQ for {{destination}} — respond by {{tat}}',
    body: '<p>New request for {{destination}} ({{pax}} pax, {{dates}}).</p><p><a href="{{short_link}}">Open the quote card</a></p>',
    carries_link: true,
  },
  [key('rfq_dispatch', 'sms')]: {
    id: 'rfq_dispatch',
    version: 1,
    channel: 'sms',
    body: 'ElateTrips: new RFQ for {{destination}}. Quote here: {{short_link}}',
    carries_link: true,
  },
  [key('rfq_dispatch', 'whatsapp')]: {
    id: 'rfq_dispatch',
    version: 1,
    channel: 'whatsapp',
    body: 'New RFQ for {{destination}} ({{pax}} pax). Tap to quote: {{short_link}}',
    carries_link: true,
  },
  [key('rfq_reminder', 'sms')]: {
    id: 'rfq_reminder',
    version: 1,
    channel: 'sms',
    body: 'ElateTrips reminder: your RFQ for {{destination}} is awaiting a quote. {{short_link}}',
    carries_link: true,
  },
  [key('rfq_reminder', 'whatsapp')]: {
    id: 'rfq_reminder',
    version: 1,
    channel: 'whatsapp',
    body: 'Reminder: RFQ for {{destination}} still open. Quote: {{short_link}}',
    carries_link: true,
  },
  [key('rfq_reminder', 'voice')]: {
    id: 'rfq_reminder',
    version: 1,
    channel: 'voice',
    body: 'Hello. This is ElateTrips about a request for {{destination}} for {{pax}} guests. Press 1 if you will quote, 2 if you cannot service, 3 to be called back.',
  },
  [key('enrichment_request', 'email')]: {
    id: 'enrichment_request',
    version: 1,
    channel: 'email',
    subject: 'Please add detail to your quote for {{destination}}',
    body: '<p>Could you add media/detail for: {{items}}?</p><p><a href="{{short_link}}">Update your quote</a></p>',
    carries_link: true,
  },
  [key('reconfirmation', 'sms')]: {
    id: 'reconfirmation',
    version: 1,
    channel: 'sms',
    body: 'ElateTrips: please reconfirm price & availability for {{destination}}. {{short_link}}',
    carries_link: true,
  },
  [key('job_card_issue', 'sms')]: {
    id: 'job_card_issue',
    version: 1,
    channel: 'sms',
    body: 'ElateTrips: your job card for {{destination}} is ready. {{short_link}}',
    carries_link: true,
  },
  [key('follow_up_notice', 'email')]: {
    id: 'follow_up_notice',
    version: 1,
    channel: 'email',
    subject: 'A note about your trip to {{destination}}',
    body: '<p>{{message}}</p>',
  },
  [key('otp', 'sms')]: {
    id: 'otp',
    version: 1,
    channel: 'sms',
    body: 'Your ElateTrips code is {{otp}}. It expires in {{ttl}} minutes.',
  },
};

export interface RenderInput {
  id: TemplateId;
  channel: Channel;
  data: Record<string, unknown>;
  /** Explicit version pin; when omitted the registered version is used. */
  version?: number;
}

/** Looks up a template def; undefined when the id/channel pair is not registered. */
export function getTemplate(id: TemplateId, channel: Channel): TemplateDef | undefined {
  return REGISTRY[key(id, channel)];
}

/** All registered templates (for a lint/spam-score pass or a registry export). */
export function allTemplates(): TemplateDef[] {
  return Object.values(REGISTRY).filter((d): d is TemplateDef => d !== undefined);
}

function interpolate(tpl: string, data: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, name: string) => {
    const v = data[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

/**
 * Renders a template to a channel-tagged message. Throws if the id/channel pair
 * is not registered, or if a pinned version does not match — a caller should
 * never silently send an unknown template.
 */
export function renderTemplate(input: RenderInput): RenderedMessage {
  const def = getTemplate(input.id, input.channel);
  if (!def) throw new Error(`No template registered for ${input.id} on ${input.channel}`);
  if (input.version !== undefined && input.version !== def.version) {
    throw new Error(`Template ${input.id}:${input.channel} version ${input.version} not found (have v${def.version})`);
  }
  const short_link = typeof input.data.short_link === 'string' ? input.data.short_link : undefined;
  return {
    channel: def.channel,
    subject: def.subject ? interpolate(def.subject, input.data) : undefined,
    body: interpolate(def.body, input.data),
    short_link: def.carries_link ? short_link : undefined,
    variables: input.data,
  };
}
