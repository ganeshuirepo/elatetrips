/**
 * Customer-identity masking for supplier-facing projections (BR-3, NFR-2). A
 * supplier sees destination / dates / pax / budget / itinerary — never a
 * customer's identity or the free-text that carries it, and never the raw
 * actor_id on an audit event. Masking lifts at `payment.captured`.
 */
import type { AuditEvent, Rfq } from './contracts.types';

export interface SupplierRfqView {
  rfq_id: string;
  status: Rfq['status'];
  occasion: {
    type: Rfq['occasion']['type'];
    celebrations?: { kind: string; decor?: boolean; cake?: boolean }[];
    decor?: boolean;
    privacy?: boolean;
  };
  destination: Rfq['destination'];
  dates: Rfq['dates'];
  travellers: Rfq['travellers'];
  hotel: { budget_per_night: Rfq['hotel']['budget_per_night']; category: Rfq['hotel']['category'] };
  inclusions: Rfq['inclusions'];
}

const MASK = '***';

export function maskRfqForSupplier(rfq: Rfq): SupplierRfqView {
  return {
    rfq_id: rfq.rfq_id,
    status: rfq.status,
    occasion: {
      type: rfq.occasion.type,
      celebrations: rfq.occasion.details?.celebrations?.map((c) => ({
        kind: c.kind,
        decor: c.decor,
        cake: c.cake,
      })),
      decor: rfq.occasion.details?.decor,
      privacy: rfq.occasion.details?.privacy,
    },
    destination: rfq.destination,
    dates: rfq.dates,
    travellers: rfq.travellers,
    hotel: { budget_per_night: rfq.hotel.budget_per_night, category: rfq.hotel.category },
    inclusions: rfq.inclusions,
  };
}

export function maskEventForSupplier(event: AuditEvent, paymentCaptured: boolean): AuditEvent {
  if (paymentCaptured) return event;
  return { ...event, actor_id: MASK, before: null, after: null };
}
