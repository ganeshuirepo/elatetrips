/**
 * Delivery / open / click telemetry sink (FR4.5) + inbound capture (FR4.2).
 *
 * The frozen domain-event catalog (`/contracts/events.md`) carries `link.opened`
 * but has no comm.send/delivery type, and adding one is a contracts change
 * (owner-only). So the comms module keeps its OWN append-only delivery log for
 * provider telemetry and exposes it behind an interface: a real deployment
 * forwards these onto the shared audit stream, while the default in-memory sink
 * keeps them queryable for tests and the M7 parser hand-off.
 *
 * Append-only: recorded events are frozen; nothing rewrites history (NFR-1).
 */
import type { DeliveryEvent, InboundMessage } from './comms.types';

export interface CommsAuditSink {
  recordDelivery(event: DeliveryEvent): DeliveryEvent;
  recordInbound(message: InboundMessage): InboundMessage;
  deliveriesFor(rfqId: string): DeliveryEvent[];
  inboundFor(rfqId: string): InboundMessage[];
  allDeliveries(): readonly DeliveryEvent[];
}

export class InMemoryCommsAuditSink implements CommsAuditSink {
  private readonly deliveries: DeliveryEvent[] = [];
  private readonly inbound: InboundMessage[] = [];
  private readonly seen = new Set<string>();

  recordDelivery(event: DeliveryEvent): DeliveryEvent {
    if (this.seen.has(event.event_id)) {
      return this.deliveries.find((e) => e.event_id === event.event_id) as DeliveryEvent;
    }
    const frozen = Object.freeze({ ...event });
    this.deliveries.push(frozen);
    this.seen.add(event.event_id);
    return frozen;
  }

  recordInbound(message: InboundMessage): InboundMessage {
    const frozen = Object.freeze({ ...message });
    this.inbound.push(frozen);
    return frozen;
  }

  deliveriesFor(rfqId: string): DeliveryEvent[] {
    return this.deliveries.filter((e) => e.rfq_id === rfqId);
  }

  inboundFor(rfqId: string): InboundMessage[] {
    return this.inbound.filter((m) => m.rfq_id === rfqId);
  }

  allDeliveries(): readonly DeliveryEvent[] {
    return this.deliveries.slice();
  }
}
