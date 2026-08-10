import { z } from 'zod';

/** Guest chat input — free text, bounded so the thread stays a chat. */
export const supportMessageSchema = z.object({
  text: z.string().trim().min(1, 'Say something first').max(500),
});

export const supportPrefSchema = z.object({
  pref: z.enum(['everything', 'handled']),
});

export const photoDecisionSchema = z.object({
  milestoneId: z.string().min(1),
  approve: z.boolean(),
  /** Structured reason when requesting a change; free text rides along. */
  reason: z.string().trim().max(300).optional(),
});

/** Vendor status update — a delay must carry its new ETA (§3.2). */
export const taskUpdateSchema = z.object({
  state: z.enum(['scheduled', 'enroute', 'inprogress', 'complete', 'delayed']),
  photoUrl: z.string().trim().max(500).optional(),
  newStart: z.string().datetime({ offset: true }).optional(),
  note: z.string().trim().max(300).optional(),
});

export const ticketActionSchema = z.object({
  action: z.enum(['ack', 'resolve']),
  resolution: z.string().trim().max(300).optional(),
});

export const photoReviewSchema = z.object({
  approve: z.boolean(),
  comment: z.string().trim().max(300).optional(),
});

/** Manager chat: guest-visible by default; internal keeps it in the crew lane. */
export const opsMessageSchema = z.object({
  text: z.string().trim().min(1, 'Say something first').max(500),
  internal: z.boolean().optional(),
});
