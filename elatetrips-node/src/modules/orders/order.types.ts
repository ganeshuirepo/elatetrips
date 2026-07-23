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
  packages: { celeb: string; names: string[] }[];
  adventures: string[];
  experiences: string[];
  items?: OrderItem[];
}

export type OrderStatus = 'confirmed' | 'cancelled';

/** How the order was paid (mock gateway for now, Razorpay-shaped later). */
export interface PaymentInfo {
  method: string;
  txnId: string;
  status: 'paid';
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
