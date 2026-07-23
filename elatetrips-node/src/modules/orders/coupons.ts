/**
 * Coupon rules — the server-side source of truth. The frontend mirrors this in
 * src/domain/coupons.ts for instant UI feedback; keep the two in sync.
 */

/**
 * Discount for a coupon on a gross amount (0 = invalid / not applicable).
 *
 * This is the server-side authority: OrderService.createOrder calls it with the
 * reconstructed gross (net total + the discount the client claimed) and rejects
 * the order unless the claimed discount equals the value returned here — so a
 * tampered client can never invent or inflate a discount.
 */
export function couponDiscount(code: string, grossAmount: number): number {
  if (code.trim().toUpperCase() !== 'DEALNOW' || grossAmount <= 0) return 0;
  // DEALNOW: 10% instant discount, capped at ₹500.
  return Math.min(Math.round(grossAmount * 0.1), 500);
}
