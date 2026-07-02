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

/** A confirmed booking, owned by the account `phone`. */
export interface Order {
  tripId: string;
  phone: string;
  status: OrderStatus;
  total: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
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
  coupon?: string;
  discount?: number;
  payment?: PaymentInfo;
  summary: OrderSummary;
}
