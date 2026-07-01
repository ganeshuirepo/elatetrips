import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { HOTELS } from '@/data/hotels';
import { selectPax } from './planSelectors';
import type { Hotel } from '@/domain/types';

const selectHotel = (s: RootState) => s.hotel;
const selectCelebs = (s: RootState) => s.plan.celebs;
const selectServices = (s: RootState) => s.services;

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

export interface ScoredHotel {
  hotel: Hotel;
  score: number;
  /** Short "great for…" badges explaining why it fits the celebration. */
  reasons: string[];
}

/**
 * Rank the filtered hotels by how well they fit the chosen celebration(s) and
 * the answers from the Services step. Each matching trait adds points and a
 * human-readable reason; hotels sort by score, then rating.
 */
export const selectScoredHotels = createSelector(
  selectFilteredHotels,
  selectCelebs,
  selectServices,
  (hotels, celebs, svc): ScoredHotel[] => {
    const scored = hotels.map((hotel): ScoredHotel => {
      const reasons: string[] = [];
      let score = 0;
      const hasAny = (arr: string[], ...vals: string[]) => vals.some((v) => arr.includes(v));
      const add = (pts: number, reason: string) => {
        score += pts;
        if (!reasons.includes(reason)) reasons.push(reason);
      };

      // Venue preference (Services step)
      if (svc.venue === 'outdoor' && hasAny(hotel.activities, 'bonfire', 'trek', 'cycling'))
        add(2, 'Outdoor-ready');
      if (svc.venue === 'indoor' && hasAny(hotel.amenities, 'spa', 'gym', 'restaurant'))
        add(2, 'Indoor comfort');

      // Couple-focused occasions: privacy & romance
      if (hasAny(celebs, 'anniversary', 'honeymoon')) {
        if (hotel.amenities.includes('spa')) add(2, 'Romantic spa');
        if (['villa', 'cottage', 'homestay'].includes(hotel.type)) add(2, 'Private & intimate');
        if (hotel.views.includes('lake')) add(1, 'Lake views');
      }
      // Birthday: tailor to age group
      if (celebs.includes('birthday')) {
        if (svc.ageGroup === 'kids' && hotel.activities.includes('kids')) add(3, 'Kid-friendly');
        else if (hotel.activities.includes('kids')) add(1, 'Family activities');
        if (hotel.roomSizes.includes('family')) add(1, 'Family rooms');
      }
      // Bachelor: energy & adventure
      if (celebs.includes('bachelor')) {
        if (hasAny(hotel.activities, 'bonfire', 'trek', 'music', 'games')) add(2, 'Party & adventure');
        if (hotel.amenities.includes('pool')) add(1, 'Pool parties');
      }
      // Milestone: premium venues
      if (celebs.includes('milestone')) {
        if (hotel.stars >= 5) add(2, 'Premium 5-star');
        if (hotel.amenities.includes('restaurant')) add(1, 'Banquet dining');
      }

      // Specific service picks (Services step)
      const picks = svc.picks ?? {};
      if (picks.music?.length && hotel.activities.includes('music')) add(1, 'Live-music venue');
      if (picks.adventure?.length && hasAny(hotel.activities, 'trek', 'cycling'))
        add(1, 'Adventure on-site');
      if (picks.food?.length && hotel.amenities.includes('restaurant')) add(1, 'In-house dining');

      return { hotel, score, reasons: reasons.slice(0, 3) };
    });

    return scored.sort((a, b) => b.score - a.score || b.hotel.rating - a.hotel.rating);
  },
);

export const selectOpenHotel = createSelector(selectHotel, (h) =>
  h.hOpen ? (HOTELS.find((x) => x.id === h.hOpen) ?? null) : null,
);

export { selectPax };
