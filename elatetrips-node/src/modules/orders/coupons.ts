/**
 * Coupon rules — the server-side source of truth. The frontend mirrors this in
 * src/domain/coupons.ts for instant UI feedback; keep the two in sync.
 */

/** Discount for a coupon on a gross amount (0 = invalid / not applicable). */
export function couponDiscount(code: string, grossAmount: number): number {
  if (code.trim().toUpperCase() !== 'DEALNOW' || grossAmount <= 0) return 0;
  // DEALNOW: 10% instant discount, capped at ₹500.
  return Math.min(Math.round(grossAmount * 0.1), 500);
}
