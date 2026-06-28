import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import type { RootState } from './store';
import { stepTravellers } from './slices/planSlice';
import { clearVehicleIfInvalid } from './slices/transportSlice';
import { setSession, clearSession } from './slices/accountSlice';

/** localStorage key for the persisted session. */
export const SESSION_KEY = 'elate.session';

/**
 * Cross-slice reactions. Keeps slices independent while preserving the
 * original behaviour where changing the traveller count drops a now-invalid
 * vehicle selection.
 */
export const listenerMiddleware = createListenerMiddleware();

listenerMiddleware.startListening({
  actionCreator: stepTravellers,
  effect: (_action, api) => {
    const { plan } = api.getState() as RootState;
    const pax = plan.adults + plan.children;
    api.dispatch(clearVehicleIfInvalid(pax));
  },
});

/** Persist (or clear) the session in localStorage whenever it changes. */
listenerMiddleware.startListening({
  matcher: isAnyOf(setSession, clearSession),
  effect: (_action, api) => {
    if (typeof window === 'undefined') return;
    const { account } = api.getState() as RootState;
    if (account.token && account.user) {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(account));
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
  },
});
