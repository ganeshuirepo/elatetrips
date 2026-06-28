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
}

export type OrderStatus = 'confirmed' | 'cancelled';

/** A confirmed booking, owned by the account `phone`. */
export interface Order {
  tripId: string;
  phone: string;
  status: OrderStatus;
  total: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
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
  summary: OrderSummary;
}
