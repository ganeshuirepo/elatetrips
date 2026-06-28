import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { DESTINATIONS } from '@/data/destinations';
import { VEHICLES } from '@/data/vehicles';
import { HOTELS, ROOM_META } from '@/data/hotels';
import { CELEBRATIONS } from '@/data/celebrations';
import { ADVENTURES, EXPERIENCES } from '@/data/activities';
import { fmtDay } from '@/domain/format';
import type { RoomSizeId, Voucher, VoucherMeta } from '@/domain/types';

const selectPlan = (s: RootState) => s.plan;
const selectTransport = (s: RootState) => s.transport;
const selectHotelState = (s: RootState) => s.hotel;
const selectAddons = (s: RootState) => s.addons;

function voucherLines(list: Voucher[], meta: Record<string, VoucherMeta>, pax: number): string[] {
  return list
    .filter((v) => meta[v.id])
    .map((v) => {
      const m = meta[v.id];
      return `${v.name} (${m.day ? fmtDay(m.day) : 'no day'}, ${Math.min(m.qty, Math.max(1, pax))} pax)`;
    });
}

/** Human-readable booking summary for the Review step. */
export const selectReviewSummary = createSelector(
  selectPlan,
  selectTransport,
  selectHotelState,
  selectAddons,
  (plan, transport, hotel, addons) => {
    const pax = plan.adults + plan.children;
    const destination =
      plan.dest
        .map((id) => DESTINATIONS.find((d) => d.id === id)?.name)
        .filter(Boolean)
        .join(', ') || '—';
    const dates = plan.start && plan.end ? `${fmtDay(plan.start)} → ${fmtDay(plan.end)}` : '—';
    const travellers = `${plan.adults} adult${plan.adults > 1 ? 's' : ''}, ${plan.children} ${plan.children === 1 ? 'child' : 'children'}`;

    let transportLabel = 'Own transport';
    if (transport.tMode === 'cab') {
      const veh = VEHICLES.find((v) => v.id === transport.tVehicle);
      const trip = transport.tTrip === 'endtoend' ? 'Complete trip' : 'Local trips';
      transportLabel = `Cab · ${trip}${veh ? ` · ${veh.name}` : ''}`;
    } else if (!transport.tMode) {
      transportLabel = '—';
    }

    const selectedHotel = HOTELS.find((h) => h.id === hotel.hHotel);
    const roomName = hotel.hRoom ? ROOM_META[hotel.hRoom as RoomSizeId]?.name : '';
    const hotelLabel = selectedHotel
      ? `${selectedHotel.name} (${'★'.repeat(selectedHotel.stars)})${roomName ? ` · ${roomName}` : ''}`
      : 'Not selected';

    const packages = plan.celebs
      .map((id) => {
        const names = addons.pkgs[id] || [];
        if (names.length === 0) return null;
        const celeb = CELEBRATIONS.find((c) => c.id === id)?.name ?? id;
        return { celeb, names };
      })
      .filter(Boolean) as { celeb: string; names: string[] }[];

    return {
      destination,
      dates,
      travellers,
      transportLabel,
      hotelLabel,
      packages,
      adventures: voucherLines(ADVENTURES, addons.advMeta, pax),
      experiences: voucherLines(EXPERIENCES, addons.expMeta, pax),
    };
  },
);
