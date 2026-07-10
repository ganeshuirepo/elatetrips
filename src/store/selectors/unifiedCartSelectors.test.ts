import { describe, it, expect } from 'vitest';
import {
  selectCartLines,
  selectCartSubtotal,
  selectCartLineCount,
} from './unifiedCartSelectors';
import { pickupEstimate } from '@/domain/pricing';
import type { TransportState } from '../slices/transportSlice';
import type { RootState } from '../store';

/** Minimal state stub — only the slices the cart selectors read. */
const stateWith = (over: {
  items?: Record<string, number>;
  picks?: Record<string, string[]>;
  hHotel?: string;
  hRoom?: string;
  dest?: string[];
  start?: string;
  end?: string;
  rooms?: number;
  transport?: Partial<TransportState>;
}): RootState =>
  ({
    cart: { items: over.items ?? {} },
    services: { picks: over.picks ?? {} },
    hotel: { hHotel: over.hHotel ?? '', hRoom: over.hRoom ?? '' },
    plan: {
      dest: over.dest ?? [],
      start: over.start ?? '',
      end: over.end ?? '',
      rooms: over.rooms ?? 1,
    },
    transport: {
      tMode: '',
      tTrip: '',
      tVehicle: '',
      tDays: 1,
      cabAdded: false,
      pickupCity: '',
      pickupAddr: '',
      pickupQuery: '',
      pickupLat: null,
      pickupLon: null,
      geoStatus: '',
      ...over.transport,
    },
  }) as unknown as RootState;

describe('selectCartLines', () => {
  it('is empty when nothing is selected anywhere', () => {
    expect(selectCartLines(stateWith({}))).toEqual([]);
  });

  it('turns shop cart quantities into priced lines', () => {
    const lines = selectCartLines(stateWith({ items: { g1: 2 } }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      source: 'shop',
      label: 'Red Roses Bouquet',
      qty: 2,
      amount: 699 * 2,
      remove: { kind: 'shop', productId: 'g1' },
    });
  });

  it('turns services-step picks into lines with the category as detail', () => {
    const lines = selectCartLines(stateWith({ picks: { surprisegifts: ['hamper'] } }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      source: 'service',
      label: 'Gourmet hamper',
      detail: 'Surprise gifts',
      amount: 1999,
      remove: { kind: 'service', cat: 'surprisegifts', optionId: 'hamper' },
    });
  });

  it('prices the selected room per night across the tour dates', () => {
    const lines = selectCartLines(
      stateWith({ hHotel: 'h1', hRoom: 'deluxe', start: '2026-12-24', end: '2026-12-27' }),
    );
    expect(lines).toHaveLength(1);
    // h1 base 8200 × deluxe 1.28 = 10496 per night × 3 nights
    expect(lines[0]).toMatchObject({
      source: 'stay',
      label: 'Nilgiri Crown Resort',
      detail: 'Deluxe Room · 3 nights',
      qty: 3,
      amount: Math.round(8200 * 1.28) * 3,
      remove: { kind: 'stay' },
    });
  });

  it('multiplies the stay by the number of rooms', () => {
    const lines = selectCartLines(
      stateWith({
        hHotel: 'h1',
        hRoom: 'standard',
        start: '2026-12-24',
        end: '2026-12-26',
        rooms: 2,
      }),
    );
    expect(lines[0].detail).toBe('Standard Room · 2 nights · 2 rooms');
    expect(lines[0].amount).toBe(8200 * 2 * 2);
  });

  it('defaults the stay to one night when dates are not set', () => {
    const lines = selectCartLines(stateWith({ hHotel: 'h1', hRoom: 'standard' }));
    expect(lines[0].detail).toBe('Standard Room · 1 night');
    expect(lines[0].amount).toBe(8200);
  });

  it('ignores unknown products, categories and options', () => {
    const lines = selectCartLines(
      stateWith({ items: { nope: 1 }, picks: { ghostcat: ['x'], surprisegifts: ['ghost'] } }),
    );
    expect(lines).toEqual([]);
  });

  it('combines all three sources into one cart with a grand subtotal', () => {
    const s = stateWith({
      items: { g1: 1 },
      picks: { surprisegifts: ['keepsake'] },
      hHotel: 'h1',
      hRoom: 'standard',
      start: '2026-12-24',
      end: '2026-12-25',
    });
    expect(selectCartLineCount(s)).toBe(3);
    expect(selectCartSubtotal(s)).toBe(699 + 1499 + 8200);
  });
});

describe('cab cart line', () => {
  const localCab: Partial<TransportState> = {
    tMode: 'cab',
    tTrip: 'local',
    tVehicle: 'sedan',
    tDays: 2,
    cabAdded: true,
  };

  it('prices a local-sightseeing cab per day once added', () => {
    const lines = selectCartLines(
      stateWith({ transport: localCab, start: '2026-12-24', end: '2026-12-26' }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      source: 'cab',
      label: 'Sedan · Local sightseeing',
      qty: 2,
      amount: 2600 * 2, // sedan localRate × 2 days
      remove: { kind: 'cab' },
    });
  });

  it('caps local-cab days at the tour length', () => {
    const lines = selectCartLines(
      stateWith({
        transport: { ...localCab, tDays: 5 },
        start: '2026-12-24',
        end: '2026-12-25', // 2-day tour
      }),
    );
    expect(lines[0].qty).toBe(2);
    expect(lines[0].amount).toBe(2600 * 2);
  });

  it('prices an end-to-end cab from the pickup estimate', () => {
    // Bengaluru-ish pickup → Ooty; expected fare from the same domain function.
    const transport: Partial<TransportState> = {
      tMode: 'cab',
      tTrip: 'endtoend',
      tVehicle: 'suv',
      cabAdded: true,
      pickupCity: 'Bengaluru',
      pickupLat: 12.9716,
      pickupLon: 77.5946,
    };
    const expected = pickupEstimate({
      pickupLat: 12.9716,
      pickupLon: 77.5946,
      destId: 'ooty',
      vehicleId: 'suv',
    });
    const lines = selectCartLines(stateWith({ transport, dest: ['ooty'] }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      source: 'cab',
      label: 'SUV · Complete trip',
      amount: expected!.fare,
      remove: { kind: 'cab' },
    });
    expect(lines[0].detail).toContain('Bengaluru');
  });

  it('emits no cab line for own transport even if the flag lingers', () => {
    const lines = selectCartLines(
      stateWith({ transport: { tMode: 'own', cabAdded: true, tVehicle: 'sedan' } }),
    );
    expect(lines).toEqual([]);
  });

  it('emits no cab line without a vehicle or without the add', () => {
    expect(
      selectCartLines(
        stateWith({ transport: { tMode: 'cab', tTrip: 'local', cabAdded: true, tVehicle: '' } }),
      ),
    ).toEqual([]);
    expect(
      selectCartLines(stateWith({ transport: { ...localCab, cabAdded: false } })),
    ).toEqual([]);
  });

  it('includes the cab in the shared subtotal', () => {
    const s = stateWith({
      items: { g1: 1 },
      transport: localCab,
      start: '2026-12-24',
      end: '2026-12-26',
    });
    expect(selectCartLineCount(s)).toBe(2);
    expect(selectCartSubtotal(s)).toBe(699 + 2600 * 2);
  });
});
