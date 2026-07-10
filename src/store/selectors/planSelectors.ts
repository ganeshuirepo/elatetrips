import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { dayList } from '@/domain/format';

const selectPlan = (s: RootState) => s.plan;
const selectTransport = (s: RootState) => s.transport;

export const selectPax = createSelector(selectPlan, (p) => p.adults + p.children);

/** Inclusive ISO date list across the chosen tour range. */
export const selectDays = createSelector(selectPlan, (p) => dayList(p.start, p.end));

/** At least one occasion is chosen (gates the opening Celebration step). */
export const selectCelebReady = createSelector(selectPlan, (p) => p.celebs.length > 0);

/** Destination + dates are set — enables the trip-bar Search button. */
export const selectPage1Ready = createSelector(
  selectPlan,
  (p) => p.dest.length > 0 && !!p.start && !!p.end,
);

/** The hotel listing shows only once a complete trip has been searched. */
export const selectShowHotels = createSelector(
  selectPage1Ready,
  selectPlan,
  (ready, p) => ready && p.searched,
);

/**
 * A pickup location has been chosen. Mirrors PickupSearch's own `chosen` flag
 * (address present): some Photon / geolocation results carry an address but no
 * separate city, which should still count as a valid pickup.
 */
export const selectPickupOk = createSelector(selectTransport, (t) => !!t.pickupAddr.trim());

/** Transport fully specified: own transport, or cab with trip + vehicle (+ pickup if complete). */
export const selectTransportFullReady = createSelector(
  selectTransport,
  selectPickupOk,
  (t, pickupOk) =>
    t.tMode === 'own' ||
    (t.tMode === 'cab' && !!t.tTrip && !!t.tVehicle && (t.tTrip !== 'endtoend' || pickupOk)),
);

