import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { pickupEstimate, localTripEstimate } from '@/domain/pricing';
import { selectDays } from './planSelectors';

const selectPlan = (s: RootState) => s.plan;
const selectTransport = (s: RootState) => s.transport;

/** Rough road distance + cab fare for the chosen pickup → destination. */
export const selectPickupEstimate = createSelector(selectPlan, selectTransport, (p, t) =>
  pickupEstimate({
    pickupLat: t.pickupLat,
    pickupLon: t.pickupLon,
    destId: p.dest[0],
    vehicleId: t.tVehicle,
  }),
);

/** Local-sightseeing fare for the chosen vehicle × days (capped to the tour length). */
export const selectLocalEstimate = createSelector(selectTransport, selectDays, (t, days) => {
  const maxDays = Math.max(1, days.length || 1);
  return localTripEstimate({ vehicleId: t.tVehicle, days: Math.min(t.tDays, maxDays) });
});

/** Help text for the Cab step's continue gate. */
export const selectCabHelp = createSelector(selectTransport, (t) => {
  if (t.tMode === 'cab' && !t.tTrip) return 'Choose a trip type for your cab.';
  if (t.tMode === 'cab' && !t.tVehicle) return 'Pick a vehicle type for your cab.';
  if (t.tMode === 'cab' && t.tTrip === 'endtoend' && !(t.pickupCity.trim() && t.pickupAddr.trim()))
    return 'Search or share your pickup location.';
  return 'Cab details look good — continue to hotels.';
});
