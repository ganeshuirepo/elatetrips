import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { packagesForCeleb } from '@/domain/rules';
import { packagesSubtotal, vouchersSubtotal } from '@/domain/pricing';
import { ADVENTURES, EXPERIENCES } from '@/data/activities';
import { selectPax } from './planSelectors';

const selectPlan = (s: RootState) => s.plan;
const selectAddons = (s: RootState) => s.addons;

export interface CelebPackageGroup {
  celebId: string;
  /** Package names to show, after age-filter + cross-celebration de-dup. */
  names: string[];
}

/**
 * Packages to render per selected celebration. A package shared across
 * celebrations appears only under the first celebration that offers it.
 */
export const selectCelebPackageGroups = createSelector(selectPlan, (plan): CelebPackageGroup[] => {
  const shown = new Set<string>();
  const groups: CelebPackageGroup[] = [];
  for (const celebId of plan.celebs) {
    if (celebId === 'wedding') continue; // wedding has its own dedicated form
    const names = packagesForCeleb(celebId, plan.celebAge, shown);
    names.forEach((n) => shown.add(n));
    groups.push({ celebId, names });
  }
  return groups;
});

/** Running cost breakdown shown on the Hotels step and Review. */
export const selectCostSummary = createSelector(selectAddons, selectPax, (addons, pax) => {
  const packages = packagesSubtotal(addons.pkgs);
  const adventures = vouchersSubtotal(ADVENTURES, addons.advMeta, pax);
  const experiences = vouchersSubtotal(EXPERIENCES, addons.expMeta, pax);
  return {
    packages,
    adventures,
    experiences,
    addonsTotal: packages + adventures + experiences,
  };
});
