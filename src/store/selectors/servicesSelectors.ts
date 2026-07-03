import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { SURPRISE_GIFTS } from '@/data/services';

const selectServices = (s: RootState) => s.services;

/**
 * The Local specials step is complete when the surprise-gifts section is
 * either engaged (a gift picked) or explicitly skipped via "I'll skip this".
 * Gates "Continue to review" and the Review breadcrumb.
 */
export const selectServicesReady = createSelector(selectServices, (svc) => {
  return (
    !!svc.skippedSections[SURPRISE_GIFTS.id] || (svc.picks[SURPRISE_GIFTS.id] ?? []).length > 0
  );
});
