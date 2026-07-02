import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';

const selectServices = (s: RootState) => s.services;

/**
 * The Services step is complete when the user engaged with it (picked a tile,
 * scheduled an occasion/experience, or left notes) — or explicitly skipped it.
 * Gates "Continue to hotels" and the Hotels breadcrumb.
 */
export const selectServicesReady = createSelector(
  selectServices,
  (svc) =>
    svc.skipSection ||
    Object.values(svc.picks).some((ids) => ids.length > 0) ||
    Object.values(svc.occasions).some((o) => o.date || o.time) ||
    Object.values(svc.schedule).some((s) => s.date || s.time) ||
    !!svc.notes.trim(),
);
