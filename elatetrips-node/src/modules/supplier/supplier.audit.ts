/**
 * Append-only supplier audit store + emitter (BR-6, NFR-1). Mirrors the 006
 * `contracts/contract.audit.ts` pattern exactly — only `append` mutates, every
 * stored event is deep-frozen so history cannot be rewritten, and handlers are
 * idempotent keyed by `event_id`.
 *
 * NOTE ON EVENT TYPES: the frozen `/contracts/events.md` catalog does not (yet)
 * define supplier-onboarding domain events. Adding them to that catalog is a
 * `/contracts` change requiring a `delta-NNN.md` (constitution §2), which is out
 * of scope for this feature branch. So these `supplier.*` types are recorded
 * MODULE-INTERNALLY here to satisfy "audit every state change"; promoting them to
 * the shared contract catalog is a follow-up delta.
 */

export type SupplierEventType =
  | 'supplier.invited'
  | 'supplier.updated'
  | 'supplier.tat.declared'
  | 'supplier.contract.accepted'
  | 'supplier.activated'
  | 'supplier.benched'
  | 'supplier.status.changed'
  | 'supplier.tier.changed'
  | 'supplier.cap.rejected'
  | 'supplier.reacceptance.required';

export type Actor = 'ops' | 'supplier' | 'system';
export type Role = 'dmc' | 'hotel' | 'provider' | 'ops' | 'platform';

export interface SupplierAuditEvent {
  event_id: string;
  type: SupplierEventType;
  actor: Actor;
  actor_id: string;
  role: Role;
  ts: string;
  subject: { supplier_id?: string; destination?: string };
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  payload: Record<string, unknown>;
}

export interface SupplierEmitInput {
  type: SupplierEventType;
  actor: Actor;
  actor_id: string;
  role: Role;
  subject: SupplierAuditEvent['subject'];
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  payload?: Record<string, unknown>;
  event_id?: string;
  ts?: string;
}

/** The audit sink the service depends on (Dependency Inversion). */
export interface ISupplierAudit {
  append(input: SupplierEmitInput): SupplierAuditEvent;
  all(): readonly SupplierAuditEvent[];
  bySubject(subject: Partial<SupplierAuditEvent['subject']>): SupplierAuditEvent[];
}

let seq = 0;
function nextEventId(): string {
  seq += 1;
  return `evt_sup_${Date.now().toString(36)}_${seq.toString(36)}`;
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

export class SupplierAuditStore implements ISupplierAudit {
  private readonly events: SupplierAuditEvent[] = [];
  private readonly seen = new Set<string>();

  append(input: SupplierEmitInput): SupplierAuditEvent {
    const event_id = input.event_id ?? nextEventId();
    if (this.seen.has(event_id)) {
      const existing = this.events.find((e) => e.event_id === event_id);
      if (existing) return existing;
    }

    const event: SupplierAuditEvent = deepFreeze({
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

  all(): readonly SupplierAuditEvent[] {
    return this.events.slice();
  }

  bySubject(subject: Partial<SupplierAuditEvent['subject']>): SupplierAuditEvent[] {
    return this.events.filter((e) =>
      Object.entries(subject).every(
        ([k, v]) => e.subject[k as keyof SupplierAuditEvent['subject']] === v,
      ),
    );
  }
}
