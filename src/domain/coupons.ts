/**
 * Coupon rules shared by the review screen (instant discount preview) and the
 * order payload. Mirrored on the backend in
 * elatetrips-node/src/modules/orders/coupons.ts — keep in sync.
 */

export interface CouponResult {
  valid: boolean;
  discount: number;
  message: string;
}

/** DEALNOW: 10% instant discount, capped at ₹500. */
export function applyCoupon(code: string, grossAmount: number): CouponResult {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { valid: false, discount: 0, message: 'Enter a coupon code.' };
  if (normalized !== 'DEALNOW') {
    return { valid: false, discount: 0, message: 'Invalid coupon code.' };
  }
  if (grossAmount <= 0) {
    return { valid: false, discount: 0, message: 'Add items to your plan before applying a coupon.' };
  }
  const discount = Math.min(Math.round(grossAmount * 0.1), 500);
  return {
    valid: true,
    discount,
    message: `DEALNOW applied — you save ₹${discount} (10% off, up to ₹500).`,
  };
}
