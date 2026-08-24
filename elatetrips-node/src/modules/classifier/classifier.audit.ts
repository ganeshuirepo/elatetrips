/**
 * Append-only audit store for classifier routing decisions (BR-6, NFR-1).
 * Self-contained (no cross-module import): mirrors the platform audit envelope
 * from `/contracts/events.md` and the deep-freeze / idempotent-by-event_id
 * pattern used elsewhere, so history can never be rewritten.
 *
 * EVENT MAPPING NOTE: `/contracts/events.md` has no `route.classified` /
 * `route.overridden` / `route.upgraded` type (FR12.6 names them, but adding an
 * event is a frozen-contract change we must not make here). The closest catalog
 * entry is `assignment.decided` — "rules pick the fulfiller (BR-16)", payload
 * `assignment_id, assigned, rule_id` — which is exactly a rules-based routing
 * decision carrying a rule_id. We emit `assignment.decided` and distinguish
 * classify / override / upgrade via `payload.kind`. See report for the deviation.
 */
import type { ClassificationDecision } from './classifier.types';

export type ClassifierEventType = 'assignment.decided';
export type Actor = 'customer' | 'ops' | 'supplier' | 'system' | 'ai';
export type Role = 'customer' | 'dmc' | 'hotel' | 'provider' | 'ops' | 'platform';

export interface AuditEvent {
  event_id: string;
  type: ClassifierEventType;
  actor: Actor;
  actor_id: string;
  role: Role;
  ts: string;
  subject: { rfq_id?: string; quote_id?: string; booking_id?: string };
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  payload: Record<string, unknown>;
}

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

export class ClassifierAuditStore {
  private readonly events: AuditEvent[] = [];
  private readonly seen = new Set<string>();

  /** Emit the routing decision as an `assignment.decided` audit event. */
  emitDecision(decision: ClassificationDecision, actor: Actor, actorId: string): AuditEvent {
    const event: AuditEvent = deepFreeze({
      event_id: nextEventId(),
      type: 'assignment.decided',
      actor,
      actor_id: actorId,
      role: 'platform',
      ts: decision.decided_at,
      subject: { rfq_id: decision.rfq_id },
      before: null,
      after: { route: decision.route, track: decision.track ?? null },
      // `assigned` mirrors the catalog payload (here: the chosen route);
      // `rule_id` satisfies BR-16 auditability; `kind` disambiguates FR12.6.
      payload: {
        kind: decision.kind,
        assigned: decision.route,
        rule_id: decision.rule_id,
        confidence: decision.confidence,
        triggering_signals: decision.triggering_signals,
        ...(decision.phase ? { phase: decision.phase } : {}),
        ...(decision.actor ? { override_actor: decision.actor } : {}),
      },
    });
    this.events.push(event);
    this.seen.add(event.event_id);
    return event;
  }

  all(): readonly AuditEvent[] {
    return this.events.slice();
  }

  bySubjectRfq(rfqId: string): AuditEvent[] {
    return this.events.filter((e) => e.subject.rfq_id === rfqId);
  }
}
