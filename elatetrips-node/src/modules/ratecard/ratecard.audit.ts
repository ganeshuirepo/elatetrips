/**
 * Append-only audit store for M17 (BR-6, NFR-1). Only `append` mutates; every
 * stored event is deep-frozen so history cannot be rewritten. Handlers are
 * idempotent, keyed by `event_id`. Mirrors the contracts-module audit store; the
 * event vocabulary is module-local (see ratecard.types → RatecardEventType)
 * because these types are not yet in the frozen events.md catalog.
 */
import type {
  RatecardActor,
  RatecardAuditEvent,
  RatecardEventType,
  RatecardRole,
} from './ratecard.types';

let seq = 0;
function nextEventId(): string {
  seq += 1;
  return `evt_${Date.now().toString(36)}_${seq.toString(36)}`;
}

export interface RatecardEmitInput {
  type: RatecardEventType;
  actor: RatecardActor;
  actor_id: string;
  role: RatecardRole;
  subject: RatecardAuditEvent['subject'];
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  payload?: Record<string, unknown>;
  event_id?: string;
  ts?: string;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

export class RatecardAuditStore {
  private readonly events: RatecardAuditEvent[] = [];
  private readonly seen = new Set<string>();

  append(input: RatecardEmitInput): RatecardAuditEvent {
    const event_id = input.event_id ?? nextEventId();
    if (this.seen.has(event_id)) {
      const existing = this.events.find((e) => e.event_id === event_id);
      if (existing) return existing;
    }
    const event: RatecardAuditEvent = deepFreeze({
      event_id,
      type: input.type,
      actor: input.actor,
      actor_id: input.actor_id,
      role: input.role,
      ts: input.ts ?? new Date().toISOString(),
      subject: input.subject,
      before: input.before ?? null,
      after: input.after ?? null,
      payload: input.payload ?? {},
    });
    this.events.push(event);
    this.seen.add(event_id);
    return event;
  }

  all(): readonly RatecardAuditEvent[] {
    return this.events.slice();
  }

  byType(type: RatecardEventType): RatecardAuditEvent[] {
    return this.events.filter((e) => e.type === type);
  }
}
