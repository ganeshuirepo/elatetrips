/**
 * Append-only audit store + domain-event emitter (BR-6, NFR-1). Only `append`
 * mutates; every stored event is deep-frozen, so any attempt to rewrite history
 * throws. Handlers are idempotent, keyed by `event_id`.
 */
import type { AuditEvent, EventType, Actor, Role } from './contracts.types';

let seq = 0;
function nextEventId(): string {
  seq += 1;
  return `evt_${Date.now().toString(36)}_${seq.toString(36)}`;
}

export interface EmitInput {
  type: EventType;
  actor: Actor;
  actor_id: string;
  role: Role;
  subject: AuditEvent['subject'];
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

export class AuditStore {
  private readonly events: AuditEvent[] = [];
  private readonly seen = new Set<string>();

  append(input: EmitInput): AuditEvent {
    const event_id = input.event_id ?? nextEventId();
    const existing = this.seen.has(event_id)
      ? this.events.find((e) => e.event_id === event_id)
      : undefined;
    if (existing) return existing;

    const event: AuditEvent = deepFreeze({
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

  all(): readonly AuditEvent[] {
    return this.events.slice();
  }

  bySubject(subject: Partial<AuditEvent['subject']>): AuditEvent[] {
    return this.events.filter((e) =>
      Object.entries(subject).every(([k, v]) => e.subject[k as keyof AuditEvent['subject']] === v),
    );
  }

  byType(type: EventType): AuditEvent[] {
    return this.events.filter((e) => e.type === type);
  }
}
