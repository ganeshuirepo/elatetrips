import { describe, it, expect } from 'vitest';
import { applyCoupon } from './coupons';

describe('applyCoupon', () => {
  it('gives 10% off with DEALNOW', () => {
    expect(applyCoupon('DEALNOW', 2000)).toMatchObject({ valid: true, discount: 200 });
  });

  it('caps the DEALNOW discount at ₹500', () => {
    expect(applyCoupon('DEALNOW', 20000).discount).toBe(500);
    expect(applyCoupon('DEALNOW', 5000).discount).toBe(500);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(applyCoupon('  dealnow ', 1000).discount).toBe(100);
  });

  it('rejects unknown codes', () => {
    expect(applyCoupon('SAVEBIG', 1000)).toMatchObject({ valid: false, discount: 0 });
  });

  it('rejects an empty cart', () => {
    expect(applyCoupon('DEALNOW', 0).valid).toBe(false);
  });
});
