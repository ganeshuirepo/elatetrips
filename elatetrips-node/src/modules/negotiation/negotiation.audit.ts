/**
 * Append-only audit log for the negotiation module (BR-6, NFR-1). Self-contained
 * so the module never reaches into another module's store; the envelope mirrors
 * `/contracts/events.md` exactly. Only `negotiation.round` is a *frozen* contract
 * event and is shaped to that catalog row ({ quote_id, by, amount, round_no }).
 *
 * The rule-lifecycle events FR13.7 names (`rule.evaluated`, `rule.published`,
 * `rule.rolled_back`) are NOT in the frozen contracts-v1.1 catalog, so adding
 * them to the shared surface would need a contracts delta (owner-merged). Until
 * then they are recorded here as module-local events for explainability, kept
 * separate from the contract event so nothing pretends the contract changed.
 */

export type NegotiationEventType =
  | 'negotiation.round' // frozen contract event
  | 'rule.evaluated' // module-local (pending contracts delta)
  | 'rule.published'
  | 'rule.rolled_back';

export type Actor = 'customer' | 'ops' | 'supplier' | 'system' | 'ai';
export type Role = 'customer' | 'dmc' | 'hotel' | 'provider' | 'ops' | 'platform';

export interface NegotiationEvent {
  event_id: string;
  type: NegotiationEventType;
  /** True only for events that also exist in the frozen contracts catalog. */
  contract_event: boolean;
  actor: Actor;
  actor_id: string;
  role: Role;
  ts: string;
  subject: { rfq_id?: string; quote_id?: string };
  payload: Record<string, unknown>;
}

export interface EmitInput {
  type: NegotiationEventType;
  actor: Actor;
  actor_id: string;
  role: Role;
  subject: NegotiationEvent['subject'];
  payload?: Record<string, unknown>;
  event_id?: string;
  ts?: string;
}

const CONTRACT_EVENTS = new Set<NegotiationEventType>(['negotiation.round']);

let seq = 0;
function nextEventId(): string {
  seq += 1;
  return `evt_${Date.now().toString(36)}_${seq.toString(36)}`;
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

export class NegotiationAuditStore {
  private readonly events: NegotiationEvent[] = [];
  private readonly seen = new Set<string>();

  append(input: EmitInput): NegotiationEvent {
    const event_id = input.event_id ?? nextEventId();
    if (this.seen.has(event_id)) {
      const existing = this.events.find((e) => e.event_id === event_id);
      if (existing) return existing;
    }
    const event: NegotiationEvent = deepFreeze({
      event_id,
      type: input.type,
      contract_event: CONTRACT_EVENTS.has(input.type),
      actor: input.actor,
      actor_id: input.actor_id,
      role: input.role,
      ts: input.ts ?? new Date().toISOString(),
      subject: input.subject,
      payload: input.payload ?? {},
    });
    this.events.push(event);
    this.seen.add(event_id);
    return event;
  }

  all(): readonly NegotiationEvent[] {
    return this.events.slice();
  }

  byType(type: NegotiationEventType): NegotiationEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  bySubject(subject: Partial<NegotiationEvent['subject']>): NegotiationEvent[] {
    return this.events.filter((e) =>
      Object.entries(subject).every(
        ([k, v]) => e.subject[k as keyof NegotiationEvent['subject']] === v,
      ),
    );
  }
}
