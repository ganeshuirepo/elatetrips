import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Cart } from '@/domain/types';

/** Shared shop cart (gifts + medical), keyed by product id → quantity. */
export interface CartState {
  items: Cart;
}

const initialState: CartState = {
  items: {},
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addToCart(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.items[id] = (state.items[id] || 0) + 1;
    },
    decFromCart(state, action: PayloadAction<string>) {
      const id = action.payload;
      const next = (state.items[id] || 0) - 1;
      if (next <= 0) delete state.items[id];
      else state.items[id] = next;
    },
  },
});

export const { addToCart, decFromCart } = cartSlice.actions;
export default cartSlice.reducer;
