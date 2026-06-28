import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { HOTELS } from '@/data/hotels';
import { selectPax } from './planSelectors';

const selectHotel = (s: RootState) => s.hotel;

/** Hotels matching every active filter (multi-select filters are AND/contains). */
export const selectFilteredHotels = createSelector(selectHotel, (h) =>
  HOTELS.filter(
    (hotel) =>
      (h.hStars.length === 0 || h.hStars.includes(String(hotel.stars))) &&
      h.hAmen.every((a) => hotel.amenities.includes(a)) &&
      h.hAct.every((a) => hotel.activities.includes(a)) &&
      h.hRoomSize.every((r) => (hotel.roomSizes as string[]).includes(r)) &&
      h.hRoomView.every((v) => hotel.views.includes(v)) &&
      h.hClimate.every((c) => hotel.climate.includes(c)) &&
      (h.hPropType.length === 0 || h.hPropType.includes(hotel.type)) &&
      hotel.price <= h.hPrice,
  ),
);

export const selectOpenHotel = createSelector(selectHotel, (h) =>
  h.hOpen ? (HOTELS.find((x) => x.id === h.hOpen) ?? null) : null,
);

export { selectPax };
