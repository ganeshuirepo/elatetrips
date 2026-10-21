import { z } from 'zod';
import { canonicalJson, createJsonProtection, type EncryptedJson } from './encrypted-json';

const id = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value && !value.includes('\0'));
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const eventSchema = z
  .object({
    event_id: id,
    ts: z.string().datetime({ offset: true }),
    actor: id,
    role: id,
    type: z.enum(['foundation.record.created', 'foundation.record.updated']),
    kind: id,
    action: id,
    membershipId: id,
    scope: z.object({ kind: z.enum(['customer', 'organization', 'partner']), id }).strict(),
    aggregateId: id,
    revision,
    schemaVersion: id,
    commandId: id,
    correlationId: id,
    before: z.unknown(),
    after: z.unknown(),
  })
  .strict()
  .refine(
    (value) =>
      'before' in value &&
      'after' in value &&
      (value.type === 'foundation.record.created'
        ? value.revision === 1 && value.before === null
        : value.revision > 1),
  );
export type FoundationEvent = z.infer<typeof eventSchema>;
export interface StoredFoundationEvent {
  _id: string;
  aggregateId: string;
  revision: number;
  body: EncryptedJson;
}
const storedSchema = z.object({ _id: id, aggregateId: id, revision, body: z.unknown() }).strict();

/** Module-local source authentication shared by delivery and projections; not an API schema. */
export function authenticateFoundationEvent(
  stored: unknown,
  protection: ReturnType<typeof createJsonProtection>,
  context: { database: string; namespace: string; eventId: string },
): FoundationEvent {
  const row = storedSchema.parse(stored);
  if (row._id !== context.eventId) throw Error('Invalid source event');
  const event = eventSchema.parse(
    protection.open(
      row.body,
      canonicalJson({
        database: context.database,
        namespace: context.namespace,
        eventId: row._id,
        aggregate: row.aggregateId,
        revision: row.revision,
      }),
    ),
  );
  if (
    event.event_id !== row._id ||
    event.aggregateId !== row.aggregateId ||
    event.revision !== row.revision
  )
    throw Error('Invalid source event');
  return event;
}
