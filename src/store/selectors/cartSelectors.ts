import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { cartCount, cartTotal } from '@/domain/pricing';

const selectCartItems = (s: RootState) => s.cart.items;

export const selectCartCount = createSelector(selectCartItems, cartCount);
export const selectCartTotal = createSelector(selectCartItems, cartTotal);
