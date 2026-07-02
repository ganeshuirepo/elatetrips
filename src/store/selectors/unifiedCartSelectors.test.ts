import { describe, it, expect } from 'vitest';
import {
  selectCartLines,
  selectCartSubtotal,
  selectCartLineCount,
} from './unifiedCartSelectors';
import type { RootState } from '../store';

/** Minimal state stub — only the slices the cart selectors read. */
const stateWith = (over: {
  items?: Record<string, number>;
  picks?: Record<string, string[]>;
  hHotel?: string;
  hRoom?: string;
  start?: string;
  end?: string;
  rooms?: number;
}): RootState =>
  ({
    cart: { items: over.items ?? {} },
    services: { picks: over.picks ?? {} },
    hotel: { hHotel: over.hHotel ?? '', hRoom: over.hRoom ?? '' },
    plan: { start: over.start ?? '', end: over.end ?? '', rooms: over.rooms ?? 1 },
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
