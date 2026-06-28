import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { dayList } from '@/domain/format';

const selectPlan = (s: RootState) => s.plan;
const selectTransport = (s: RootState) => s.transport;

export const selectPax = createSelector(selectPlan, (p) => p.adults + p.children);

/** Inclusive ISO date list across the chosen tour range. */
export const selectDays = createSelector(selectPlan, (p) => dayList(p.start, p.end));

/** Every selected celebration has a day chosen. */
export const selectAllCelebDays = createSelector(selectPlan, (p) =>
  p.celebs.every((id) => !!p.celebDays[id]),
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

export const selectTransportModeReady = createSelector(selectTransport, (t) => !!t.tMode);

/** Transport fully specified: own transport, or cab with trip + vehicle (+ pickup if complete). */
export const selectTransportFullReady = createSelector(
  selectTransport,
  selectPickupOk,
  (t, pickupOk) =>
    t.tMode === 'own' ||
    (t.tMode === 'cab' && !!t.tTrip && !!t.tVehicle && (t.tTrip !== 'endtoend' || pickupOk)),
);

/** Plan step complete enough to advance (all basics + a transport mode chosen). */
export const selectPlanReady = createSelector(
  selectAllReady,
  selectTransportModeReady,
  (allReady, mode) => allReady && mode,
);

export const selectShowCab = createSelector(selectTransport, (t) => t.tMode === 'cab');

/** Contextual helper text shown beneath the primary action. */
export const selectPlanHelp = createSelector(
  selectPlan,
  selectAllCelebDays,
  selectTransport,
  (p, allDays, t) => {
    if (p.dest.length === 0) return 'Search and pick a destination to continue.';
    if (!p.start || !p.end) return 'Choose your tour start and end dates.';
    if (p.celebs.length === 0) return 'Pick at least one celebration to search.';
    if (!allDays) return 'Choose a day for each celebration you selected.';
    if (!t.tMode) return "Tell us how you'll get around.";
    if (t.tMode === 'cab') return 'Add your cab details on the next step.';
    return 'Everything looks good — continue to hotels.';
  },
);
