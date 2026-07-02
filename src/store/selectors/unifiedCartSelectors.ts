import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { ALL_PRODUCTS } from '@/data/shop';
import { CATEGORY_BY_ID } from '@/data/services';
import { HOTELS, ROOM_META } from '@/data/hotels';
import type { RoomSizeId } from '@/domain/types';

/**
 * One entry in the shared cart. Lines are DERIVED from the owning slices
 * (shop cart, services picks, hotel room) rather than duplicated into cart
 * state — so tiles keep their toggle behaviour and the cart can never drift
 * out of sync. `remove` describes how to take the line out of its slice.
 */
export interface CartLine {
  key: string;
  source: 'shop' | 'service' | 'stay';
  label: string;
  detail: string;
  qty: number;
  amount: number;
  remove:
    | { kind: 'shop'; productId: string }
    | { kind: 'service'; cat: string; optionId: string }
    | { kind: 'stay' };
}

const selectShopItems = (s: RootState) => s.cart.items;
const selectServicePicks = (s: RootState) => s.services.picks;
const selectHotelId = (s: RootState) => s.hotel.hHotel;
const selectRoomId = (s: RootState) => s.hotel.hRoom;
const selectStart = (s: RootState) => s.plan.start;
const selectEnd = (s: RootState) => s.plan.end;
const selectRooms = (s: RootState) => s.plan.rooms || 1;

const nightsBetween = (start: string, end: string): number => {
  if (!start || !end) return 1;
  const diff = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
  return Math.max(1, diff);
};

/** Every cart line across the shop, services step and stay step. */
export const selectCartLines = createSelector(
  selectShopItems,
  selectServicePicks,
  selectHotelId,
  selectRoomId,
  selectStart,
  selectEnd,
  selectRooms,
  (shopItems, picks, hotelId, roomId, start, end, rooms): CartLine[] => {
    const lines: CartLine[] = [];

    for (const [id, qty] of Object.entries(shopItems)) {
      const p = ALL_PRODUCTS.find((x) => x.id === id);
      if (!p || qty <= 0) continue;
      lines.push({
        key: `shop:${id}`,
        source: 'shop',
        label: p.name,
        detail: qty > 1 ? `Surprise gift · ${qty} × ₹${p.price}` : 'Surprise gift',
        qty,
        amount: p.price * qty,
        remove: { kind: 'shop', productId: id },
      });
    }

    for (const [cat, ids] of Object.entries(picks)) {
      const category = CATEGORY_BY_ID[cat];
      if (!category) continue;
      for (const oid of ids) {
        const option = category.options.find((o) => o.id === oid);
        if (!option) continue;
        lines.push({
          key: `svc:${cat}:${oid}`,
          source: 'service',
          label: option.label,
          detail: category.label,
          qty: 1,
          amount: option.price ?? 0,
          remove: { kind: 'service', cat, optionId: oid },
        });
      }
    }

    const hotel = HOTELS.find((h) => h.id === hotelId);
    const room = roomId ? ROOM_META[roomId as RoomSizeId] : undefined;
    if (hotel && room) {
      const nights = nightsBetween(start, end);
      const roomsLabel = rooms > 1 ? ` · ${rooms} rooms` : '';
      lines.push({
        key: 'stay',
        source: 'stay',
        label: hotel.name,
        detail: `${room.name} · ${nights} night${nights > 1 ? 's' : ''}${roomsLabel}`,
        qty: nights,
        amount: Math.round(hotel.price * room.mult) * nights * rooms,
        remove: { kind: 'stay' },
      });
    }

    return lines;
  },
);

/** Rupee total of every cart line (shop + services + stay). */
export const selectCartSubtotal = createSelector(selectCartLines, (lines) =>
  lines.reduce((sum, l) => sum + l.amount, 0),
);

/** Number of lines shown on the header badge (a multi-qty product is one line). */
export const selectCartLineCount = createSelector(selectCartLines, (lines) => lines.length);
