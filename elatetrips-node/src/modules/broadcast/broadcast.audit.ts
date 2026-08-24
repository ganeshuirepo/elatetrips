/**
 * Append-only audit store for M5 (BR-6, NFR-1). Mirrors the platform audit
 * pattern: only `append` mutates, every stored event is deep-frozen, and handlers
 * are idempotent keyed by `event_id`. Kept module-local so M5 stays self-contained
 * and does not reach into another module's internals; at integration these events
 * are forwarded to the shared audit stream by the composition root.
 */
import type { Actor, BroadcastAuditEvent, BroadcastEventType, Role } from './broadcast.types';

let seq = 0;
function nextEventId(): string {
  seq += 1;
  return `evt_${Date.now().toString(36)}_${seq.toString(36)}`;
}

export interface EmitInput {
  type: BroadcastEventType;
  actor: Actor;
  actor_id: string;
  role: Role;
  subject: BroadcastAuditEvent['subject'];
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

export class BroadcastAuditStore {
  private readonly events: BroadcastAuditEvent[] = [];
  private readonly seen = new Set<string>();

  append(input: EmitInput): BroadcastAuditEvent {
    const event_id = input.event_id ?? nextEventId();
    if (this.seen.has(event_id)) {
      const existing = this.events.find((e) => e.event_id === event_id);
      if (existing) return existing;
    }
    const event: BroadcastAuditEvent = deepFreeze({
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

  all(): readonly BroadcastAuditEvent[] {
    return this.events.slice();
  }

  byType(type: BroadcastEventType): BroadcastAuditEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  byRfq(rfq_id: string): BroadcastAuditEvent[] {
    return this.events.filter((e) => e.subject.rfq_id === rfq_id);
  }
}
