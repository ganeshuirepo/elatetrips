import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { dayList } from '@/domain/format';

const selectPlan = (s: RootState) => s.plan;
const selectTransport = (s: RootState) => s.transport;

export const selectPax = createSelector(selectPlan, (p) => p.adults + p.children);

/** Inclusive ISO date list across the chosen tour range. */
export const selectDays = createSelector(selectPlan, (p) => dayList(p.start, p.end));

/**
 * Every selected celebration has a day chosen. Wedding is exempt — its date is
 * captured later in the enquiry form, so it needs no day on the Plan step.
 */
export const selectAllCelebDays = createSelector(selectPlan, (p) =>
  p.celebs.filter((id) => id !== 'wedding').every((id) => !!p.celebDays[id]),
);

/** Destination + dates are set (page-1 block of the Plan step). */
export const selectPage1Ready = createSelector(
  selectPlan,
  (p) => p.dest.length > 0 && !!p.start && !!p.end,
);

/** At least one celebration with every day chosen (page-2 block). */
export const selectPage2Ready = createSelector(
  selectPlan,
  selectAllCelebDays,
  (p, allDays) => p.celebs.length > 0 && allDays,
);

export const selectAllReady = createSelector(selectPage1Ready, selectPage2Ready, (a, b) => a && b);

/** Pickup city + address both present (required for a complete trip). */
export const selectPickupOk = createSelector(
  selectTransport,
  (t) => !!t.pickupCity.trim() && !!t.pickupAddr.trim(),
);

/** Transport fully specified: own transport, or cab with trip + vehicle (+ pickup if complete). */
export const selectTransportFullReady = createSelector(
  selectTransport,
  selectPickupOk,
  (t, pickupOk) =>
    t.tMode === 'own' ||
    (t.tMode === 'cab' && !!t.tTrip && !!t.tVehicle && (t.tTrip !== 'endtoend' || pickupOk)),
);

/**
 * Plan step complete enough to advance (destination, dates, celebrations).
 * Transport now lives entirely on the Cab step, so it no longer gates Plan.
 */
export const selectPlanReady = createSelector(selectAllReady, (allReady) => allReady);

/** Contextual helper text shown beneath the primary action. */
export const selectPlanHelp = createSelector(selectPlan, selectAllCelebDays, (p, allDays) => {
  if (p.dest.length === 0) return 'Search and pick a destination to continue.';
  if (!p.start || !p.end) return 'Choose your tour start and end dates.';
  if (p.celebs.length === 0) return 'Pick at least one celebration to search.';
  if (!allDays) return 'Choose a day for each celebration you selected.';
  return 'Everything looks good — choose your transport next.';
});
