import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/** A compact, display-ready snapshot of the booked plan. */
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

/** A confirmed booking shown in the user's "My orders". */
export interface Order {
  /** Unique trip id, e.g. "ELT-100001". */
  id: string;
  /** Account mobile number this trip belongs to (the login number). */
  phone: string;
  /** Epoch ms when confirmed (supplied by the caller). */
  createdAt: number;
  total: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  summary: OrderSummary;
}

/** Payload to create an order; the trip id is assigned by the reducer. */
export type NewOrder = Omit<Order, 'id'>;

interface OrdersState {
  /** Monotonic counter backing the unique trip id. */
  seq: number;
  list: Order[];
}

const initialState: OrdersState = {
  seq: 1,
  list: [],
};

const ordersSlice = createSlice({
  name: 'orders',
  initialState,
  reducers: {
    /** Append a confirmed booking, assigning a guaranteed-unique trip id. */
    addOrder(state, action: PayloadAction<NewOrder>) {
      const id = `ELT-${100000 + state.seq}`;
      state.list.unshift({ id, ...action.payload });
      state.seq += 1;
    },
  },
});

export const { addOrder } = ordersSlice.actions;
export default ordersSlice.reducer;
