/**
 * Zod guards for the comms endpoints. The validate() middleware parses and
 * replaces req parts at the edge, so the controller receives typed, clean data
 * and never re-checks shapes (mirrors the catalog module's approach).
 */
import { z } from 'zod';

const channel = z.enum(['in_app', 'email', 'sms', 'whatsapp', 'voice']);

const templateId = z.enum([
  'rfq_dispatch',
  'rfq_reminder',
  'enrichment_request',
  'reconfirmation',
  'job_card_issue',
  'follow_up_notice',
  'otp',
]);

const consent = z
  .object({
    in_app: z.boolean().optional(),
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
    whatsapp: z.boolean().optional(),
    voice: z.boolean().optional(),
  })
  .strict()
  .optional();

const recipient = z.object({
  recipient_id: z.string().trim().min(1).max(128),
  email: z.string().email().optional(),
  phone: z.string().trim().min(3).max(20).optional(),
  whatsapp: z.string().trim().min(3).max(20).optional(),
  consent,
});

/** POST /comm/send — render a versioned template and transmit it. */
export const sendBodySchema = z.object({
  templateId,
  channel,
  recipient,
  data: z.record(z.unknown()).optional(),
  rfq_id: z.string().trim().min(1).max(128).optional(),
  mint_link_purpose: z.string().trim().min(1).max(64).optional(),
  version: z.coerce.number().int().positive().optional(),
});

/** POST /comm/verify — check a magic link (open/click). */
export const verifyBodySchema = z.object({
  token: z.string().trim().min(1),
  rfq_id: z.string().trim().min(1).max(128).optional(),
  recipient_id: z.string().trim().min(1).max(128).optional(),
});

/** POST /comm/inbound — raw inbound capture for the M7 parser (FR4.2). */
export const inboundBodySchema = z.object({
  channel,
  from: z.string().trim().min(1).max(320),
  rfq_id: z.string().trim().min(1).max(128).optional(),
  subject: z.string().max(998).optional(),
  raw: z.string().min(1),
});

/** POST /comm/delivery — provider delivery/open/click/bounce webhook (FR4.5). */
export const deliveryBodySchema = z.object({
  provider_message_id: z.string().trim().min(1).max(256),
  channel,
  state: z.enum(['queued', 'sent', 'delivered', 'opened', 'clicked', 'failed', 'bounced']),
  recipient_id: z.string().trim().min(1).max(128),
  rfq_id: z.string().trim().min(1).max(128).optional(),
  detail: z.string().max(512).optional(),
});

/** POST /comm/opt-out — permanent opt-out (FR4.7). */
export const optOutBodySchema = z.object({
  recipient_id: z.string().trim().min(1).max(128),
});

/** GET /comm/rfq/:rfqId/deliveries — audit read. */
export const rfqParamSchema = z.object({ rfqId: z.string().trim().min(1).max(128) });
