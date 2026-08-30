/**
 * Domain types for the orders module — the vocabulary shared by the controller,
 * service, repository and model. `Order` is the canonical shape read back from
 * storage; `CreateOrderInput` is the trusted subset a client may send. The
 * server assigns everything else — phone (from the JWT), tripId, status and the
 * createdAt/updatedAt timestamps — so those are absent from CreateOrderInput.
 */

/** One cart line (surprise gift, service or stay) included in the order. */
export interface OrderItem {
  label: string;
  detail: string;
  qty: number;
  amount: number;
}

/** Display-ready snapshot of the booked plan (mirrors the frontend order). */
export interface OrderSummary {
  destination: string;
  dates: string;
  travellers: string;
  transportLabel: string;
  hotelLabel: string;
  /**
   * Properties the traveller asked for at checkout, best first, up to three.
   * A preference rather than a booking — the celebration manager works down the
   * list. Kept as names so the order stays readable if a hotel is later retired
   * from the catalogue.
   *
   * Optional because orders written before the field existed simply do not have
   * it: the schema default fills it on write, never on read, so claiming it is
   * always present would be a type that lies about older documents.
   */
  preferredHotels?: string[];
  packages: { celeb: string; names: string[] }[];
  adventures: string[];
  experiences: string[];
  items?: OrderItem[];
}

export const ORDER_STATUSES = ['confirmed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Only settled payments are ever written. An order is created after the gateway
 * has confirmed, so there is no 'pending' — a payment that did not complete
 * leaves no order behind at all.
 */
export const PAYMENT_STATUSES = ['paid'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** How the order was paid (mock gateway for now, Razorpay-shaped later). */
export interface PaymentInfo {
  method: string;
  txnId: string;
  status: PaymentStatus;
}

/** The celebration brief captured at checkout. */
export interface CelebrationBrief {
  occasionDate: string;
  cakeMessage: string;
  dietary: string;
  notes: string;
  /** The surprise must not reach the person being celebrated. */
  keepSecret: boolean;
}

/** A confirmed booking, owned by the account `phone`. */
export interface Order {
  tripId: string;
  phone: string;
  status: OrderStatus;
  total: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  celebration?: CelebrationBrief;
  coupon?: string;
  discount?: number;
  payment?: PaymentInfo;
  summary: OrderSummary;
  createdAt: Date;
  updatedAt: Date;
}

/** What a client supplies to create an order (the owner phone comes from the JWT). */
export interface CreateOrderInput {
  total: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  celebration?: CelebrationBrief;
  coupon?: string;
  discount?: number;
  payment?: PaymentInfo;
  summary: OrderSummary;
}
