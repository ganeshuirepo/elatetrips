import { z } from 'zod';

const id = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value && !value.includes('\0'));
const instant = z.date();
export const deliverySchema = z
  .object({
    _id: id,
    eventId: id,
    format: z.literal(2),
    state: z.enum(['pending', 'leased', 'delivered', 'dead']),
    version: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    attempts: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    totalAttempts: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    recoveryCount: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    availableAt: instant,
    leaseUntil: instant.nullable(),
    leaseToken: id.nullable(),
    workerId: id.nullable(),
    lastError: z.enum(['DELIVERY_FAILED', 'INVALID_EVENT', 'LEASE_EXPIRED']).nullable(),
    deliveredAt: instant.nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    if (
      row._id !== row.eventId ||
      row.totalAttempts < row.attempts ||
      row.recoveryCount > row.totalAttempts ||
      (row.state !== 'pending' && row.attempts === 0) ||
      row.totalAttempts > row.version ||
      row.recoveryCount > row.version ||
      (row.state === 'leased') !==
        (row.leaseUntil !== null && row.leaseToken !== null && row.workerId !== null) ||
      (row.state !== 'leased' &&
        (row.leaseUntil !== null || row.leaseToken !== null || row.workerId !== null)) ||
      (row.state === 'delivered') !== (row.deliveredAt !== null)
    )
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid delivery state' });
  });
export type OutboxDelivery = z.infer<typeof deliverySchema>;
export type DeliverySnapshot = Omit<OutboxDelivery, 'leaseToken'>;
export function deliverySnapshot({ leaseToken, ...row }: OutboxDelivery): DeliverySnapshot {
  return row;
}

/** Unreleased local queue format; no shared domain contract is adopted here. */
export function pendingDelivery(eventId: string, timestamp: string): OutboxDelivery {
  return deliverySchema.parse({
    _id: eventId,
    eventId,
    format: 2,
    state: 'pending',
    version: 0,
    attempts: 0,
    totalAttempts: 0,
    recoveryCount: 0,
    availableAt: new Date(timestamp),
    leaseUntil: null,
    leaseToken: null,
    workerId: null,
    lastError: null,
    deliveredAt: null,
  });
}
