import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { selectReviewSummary } from './reviewSelectors';
import { selectCostSummary } from './addonsSelectors';
import type { NewOrder } from '../slices/ordersSlice';

const selectReview = (s: RootState) => s.review;
const selectOrdersList = (s: RootState) => s.orders.list;

/** Orders belonging to the currently signed-in mobile number (empty when logged out). */
export const selectMyOrders = createSelector(selectOrdersList, selectReview, (list, review) =>
  review.loggedIn ? list.filter((o) => o.phone === review.authPhone) : [],
);

/**
 * Assembles the order snapshot (everything except the trip id and timestamp,
 * which are stamped when the order is created).
 */
export const selectOrderDraft = createSelector(
  selectReviewSummary,
  selectCostSummary,
  selectReview,
  (summary, cost, review): Omit<NewOrder, 'createdAt'> => ({
    phone: review.authPhone,
    total: cost.addonsTotal,
    contactName: review.contactName,
    contactPhone: review.contactPhone || review.authPhone,
    contactEmail: review.contactEmail,
    summary,
  }),
);
