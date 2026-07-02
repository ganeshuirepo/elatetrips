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

/** Destination + dates are set. */
export const selectPage1Ready = createSelector(
  selectPlan,
  (p) => p.dest.length > 0 && !!p.start && !!p.end,
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

/**
 * Plan STEP ready — destination, dates and at least one celebration (the
 * celebration picker now lives on the Plan step). Transport is chosen later,
 * on the Hotels step, so it is not gated here.
 */
export const selectPlanStepReady = createSelector(
  selectPage1Ready,
  selectCelebReady,
  (page1, celeb) => page1 && celeb,
);

/**
 * Everything before Review is complete — plan (dest + dates + celebration)
 * AND transport, which is picked on the Hotels step. Gates the Review step.
 */
export const selectPlanReady = createSelector(
  selectPlanStepReady,
  selectTransportFullReady,
  (planStep, transport) => planStep && transport,
);

/** Contextual helper text shown beneath the primary action on the Plan step. */
export const selectPlanHelp = createSelector(selectPlan, (p) => {
  if (p.dest.length === 0) return 'Search and pick a destination to continue.';
  if (!p.start || !p.end) return 'Choose your tour start and end dates.';
  if (p.celebs.length === 0) return 'Pick at least one occasion to celebrate.';
  return 'Everything looks good — next, tailor your services.';
});

/** Contextual helper text for the transport question on the Hotels step. */
export const selectTransportHelp = createSelector(selectTransport, (t) => {
  if (!t.tMode) return "Tell us how you'll get around.";
  if (t.tMode === 'cab' && !t.tTrip) return 'Choose a trip type for your cab.';
  if (t.tMode === 'cab' && !t.tVehicle) return 'Pick a vehicle type for your cab.';
  if (t.tMode === 'cab' && t.tTrip === 'endtoend' && !t.pickupAddr.trim())
    return 'Search or share your pickup location.';
  return 'Add any extras, then review your celebration plan.';
});
