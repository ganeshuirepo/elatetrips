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
  | 'rfq_ack'
  | 'quote_summary'
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
 * One brand shell around every email body. Inline styles only — every mail
 * client strips <style> blocks, and half of them strip <head> with it. Nothing
 * here is business content: the shell is chrome, the `inner` is the message.
 */
const shell = (inner: string): string =>
  '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;' +
  'max-width:560px;margin:0 auto;padding:24px;color:#1c2b2a;line-height:1.55">' +
  '<div style="font-size:20px;font-weight:800;color:#0b3d3a;letter-spacing:-.3px">Elate Trips</div>' +
  '<div style="height:3px;width:42px;background:#0b3d3a;margin:10px 0 20px"></div>' +
  inner +
  '<p style="margin-top:28px;padding-top:16px;border-top:1px solid #e6ebea;font-size:12px;color:#7b8b89">' +
  'Elate Trips · custom trips, quoted by people who run them.<br>' +
  'Reply to this email and it reaches the trip desk directly.</p></div>';

/** A call-to-action that survives clients which drop background colours. */
const cta = (label: string): string =>
  `<p style="margin:24px 0"><a href="{{short_link}}" ` +
  'style="background:#0b3d3a;color:#fff;text-decoration:none;padding:12px 22px;' +
  `border-radius:8px;display:inline-block;font-weight:700">${label}</a></p>`;

/**
 * The registry. Kept intentionally spare — real approved copy (DLT-registered
 * SMS, BSP-approved WA templates, branded email HTML) replaces these bodies as
 * config/content without any code change. Versions start at 1.
 */
const REGISTRY: Partial<Record<TemplateKey, TemplateDef>> = {
  [key('rfq_dispatch', 'email')]: {
    id: 'rfq_dispatch',
    version: 2,
    channel: 'email',
    subject: 'Quote request: {{destination}} for {{pax}} — {{dates_short}}',
    body: shell(
      '<p>Hello {{supplier_name}},</p>' +
        '<p>A confirmed enquiry has come in that matches what you cover. The full brief is on the quote card — open it, price what you can, and skip what you cannot.</p>' +
        '<table style="border-collapse:collapse;margin:18px 0;font-size:14px">' +
        '<tr><td style="padding:4px 16px 4px 0;color:#7b8b89">Destination</td><td style="font-weight:700">{{destination}}</td></tr>' +
        '<tr><td style="padding:4px 16px 4px 0;color:#7b8b89">Guests</td><td style="font-weight:700">{{pax}}</td></tr>' +
        '<tr><td style="padding:4px 16px 4px 0;color:#7b8b89">Dates</td><td style="font-weight:700">{{dates}}</td></tr>' +
        '<tr><td style="padding:4px 16px 4px 0;color:#7b8b89">Occasion</td><td style="font-weight:700">{{occasion}}</td></tr>' +
        '<tr><td style="padding:4px 16px 4px 0;color:#7b8b89">Reference</td><td style="font-weight:700">{{rfq_id}}</td></tr>' +
        '</table>' +
        cta('Open the quote card') +
        '<p style="font-size:14px;color:#5b6b69">We would like your response within {{tat}}. A partial quote is welcome — the card lets you mark any line as one you cannot service.</p>',
    ),
    carries_link: true,
  },
  [key('rfq_ack', 'email')]: {
    id: 'rfq_ack',
    version: 1,
    channel: 'email',
    subject: 'Your {{destination}} trip is with our partners — {{rfq_id}}',
    body: shell(
      '<p>Thanks {{customer_name}},</p>' +
        '<p>Your request is confirmed and has just gone out to {{supplier_count}} operators who run trips in {{destination}}. They quote against exactly the brief you approved — nothing gets substituted behind your back.</p>' +
        '<table style="border-collapse:collapse;margin:18px 0;font-size:14px">' +
        '<tr><td style="padding:4px 16px 4px 0;color:#7b8b89">Destination</td><td style="font-weight:700">{{destination}}</td></tr>' +
        '<tr><td style="padding:4px 16px 4px 0;color:#7b8b89">Guests</td><td style="font-weight:700">{{pax}}</td></tr>' +
        '<tr><td style="padding:4px 16px 4px 0;color:#7b8b89">Dates</td><td style="font-weight:700">{{dates}}</td></tr>' +
        '<tr><td style="padding:4px 16px 4px 0;color:#7b8b89">Occasion</td><td style="font-weight:700">{{occasion}}</td></tr>' +
        '<tr><td style="padding:4px 16px 4px 0;color:#7b8b89">Reference</td><td style="font-weight:700">{{rfq_id}}</td></tr>' +
        '</table>' +
        '<p>Quotes usually start arriving within {{tat}}. We will send you the comparison as soon as there is something worth comparing — you will not get a mail per quote.</p>',
    ),
  },
  [key('quote_summary', 'email')]: {
    id: 'quote_summary',
    version: 1,
    channel: 'email',
    subject: 'Your {{destination}} quotes are in — {{quote_count}} to compare',
    body: shell(
      '<p>Hi {{customer_name}},</p>' +
        '<p>{{quote_count}} operators have quoted on {{rfq_id}}. Here they are, best match first:</p>' +
        '{{quote_rows}}' +
        '<p style="font-size:14px;color:#5b6b69">Prices hold until the validity date shown against each. Reply with the one you want and we will reconfirm availability before anything is charged.</p>',
    ),
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
