import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { applyCoupon } from '@/domain/coupons';
import { selectCostSummary } from './addonsSelectors';
import { selectCartSubtotal } from './unifiedCartSelectors';

const selectAppliedCoupon = (s: RootState) => s.review.coupon;

/** Gross order value: planner add-ons + every cart line (gifts, services, stay). */
export const selectOrderGross = createSelector(
  selectCostSummary,
  selectCartSubtotal,
  (cost, cartSubtotal) => cost.addonsTotal + cartSubtotal,
);

/** Discount for the applied coupon (0 when none / invalid for this total). */
export const selectDiscount = createSelector(
  selectAppliedCoupon,
  selectOrderGross,
  (coupon, gross) => (coupon ? applyCoupon(coupon, gross).discount : 0),
);

/** What the user actually pays. */
export const selectPayable = createSelector(
  selectOrderGross,
  selectDiscount,
  (gross, discount) => Math.max(0, gross - discount),
);
