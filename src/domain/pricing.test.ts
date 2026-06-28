import { describe, it, expect } from 'vitest';
import {
  haversineKm,
  pickupEstimate,
  localTripEstimate,
  voucherLineTotal,
  vouchersSubtotal,
  packagesSubtotal,
  cartTotal,
  cartCount,
} from './pricing';
import { ADVENTURES } from '@/data/activities';

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm(11.41, 76.69, 11.41, 76.69)).toBeCloseTo(0, 5);
  });

  it('approximates a known distance (Bangalore → Ooty ≈ 230 km)', () => {
    const km = haversineKm(12.9716, 77.5946, 11.4102, 76.695);
    expect(km).toBeGreaterThan(190);
    expect(km).toBeLessThan(230);
  });
});

describe('pickupEstimate', () => {
  it('returns null without coordinates or destination', () => {
    expect(
      pickupEstimate({ pickupLat: null, pickupLon: null, destId: 'ooty', vehicleId: 'suv' }),
    ).toBeNull();
    expect(
      pickupEstimate({ pickupLat: 12.97, pickupLon: 77.59, destId: undefined, vehicleId: 'suv' }),
    ).toBeNull();
  });

  it('computes round-trip km and fare for a chosen vehicle', () => {
    const est = pickupEstimate({
      pickupLat: 12.9716,
      pickupLon: 77.5946,
      destId: 'ooty',
      vehicleId: 'suv',
    });
    expect(est).not.toBeNull();
    expect(est!.roundTripKm).toBe(est!.oneWayKm * 2);
    expect(est!.hasVehicle).toBe(true);
    expect(est!.rate).toBe(18);
    expect(est!.fare).toBe(Math.round((est!.roundTripKm * 18) / 100) * 100);
    expect(est!.destName).toBe('Ooty');
  });

  it('omits fare when no vehicle is chosen', () => {
    const est = pickupEstimate({
      pickupLat: 12.9716,
      pickupLon: 77.5946,
      destId: 'ooty',
      vehicleId: '',
    });
    expect(est!.hasVehicle).toBe(false);
    expect(est!.fare).toBeNull();
  });
});

describe('localTripEstimate', () => {
  it('scales the per-day package by the number of days', () => {
    const one = localTripEstimate({ vehicleId: 'suv', days: 1 });
    expect(one.hasVehicle).toBe(true);
    expect(one.perDay).toBe(3400);
    expect(one.total).toBe(3400);

    const three = localTripEstimate({ vehicleId: 'suv', days: 3 });
    expect(three.total).toBe(3400 * 3);
    expect(three.days).toBe(3);
  });

  it('floors days at 1 and reports zero with no vehicle', () => {
    expect(localTripEstimate({ vehicleId: 'suv', days: 0 }).days).toBe(1);
    const none = localTripEstimate({ vehicleId: '', days: 2 });
    expect(none.hasVehicle).toBe(false);
    expect(none.perDay).toBe(0);
    expect(none.total).toBe(0);
  });
});

describe('voucher pricing', () => {
  it('caps headcount at pax', () => {
    expect(voucherLineTotal(1200, 5, 3)).toBe(1200 * 3);
    expect(voucherLineTotal(1200, 2, 3)).toBe(1200 * 2);
  });

  it('subtotals only selected vouchers', () => {
    const meta = { trek: { day: '2026-06-01', qty: 2 } };
    const sub = vouchersSubtotal(ADVENTURES, meta, 4);
    expect(sub).toBe(1200 * 2);
  });
});

describe('packagesSubtotal', () => {
  it('sums prices across all celebrations', () => {
    const sub = packagesSubtotal({
      birthday: ['Cake & decoration', 'Magician show'],
      anniversary: ['Candlelight dinner'],
    });
    expect(sub).toBe(2500 + 8000 + 5000);
  });
});

describe('cart', () => {
  it('totals value and count of the shared cart', () => {
    const cart = { g1: 2, m1: 1 };
    expect(cartCount(cart)).toBe(3);
    expect(cartTotal(cart)).toBe(699 * 2 + 899);
  });
});
