import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { templateFor, TILE_CATEGORIES, OCCASION_TILES, SURPRISE_GIFTS } from '@/data/services';
import { CELEBRATIONS } from '@/data/celebrations';

const selectServices = (s: RootState) => s.services;
const selectCelebs = (s: RootState) => s.plan.celebs;

const CATEGORY_OF = Object.fromEntries(CELEBRATIONS.map((c) => [c.id, c.category]));

/** Category ids whose tiles appear under a celebration's panel. */
const celebrationCats = (id: string): string[] => [
  ...templateFor(id).sections,
  ...(TILE_CATEGORIES[CATEGORY_OF[id] ?? 'celebration'] ?? []),
];

/**
 * The Services step is complete when EVERY panel (one per celebration, the
 * combined Escapes panel, and Surprise gifts) is either engaged — a tile
 * picked or its basics scheduled — or explicitly skipped via "I'll skip this".
 * Gates "Continue to hotels" and the Hotels breadcrumb.
 */
export const selectServicesReady = createSelector(
  selectServices,
  selectCelebs,
  (svc, celebs) => {
    const picked = (cat: string) => (svc.picks[cat] ?? []).length > 0;
    const skipped = (key: string) => !!svc.skippedSections[key];

    const celebrationIds = celebs.filter((id) => CATEGORY_OF[id] !== 'rejuvenate');
    const escapeIds = celebs.filter((id) => CATEGORY_OF[id] === 'rejuvenate');

    const celebrationsOk = celebrationIds.every((id) => {
      if (skipped(id)) return true;
      const o = svc.occasions[id];
      return !!(o?.date || o?.time) || celebrationCats(id).some(picked);
    });

    const escapeCats = escapeIds.flatMap((id) => OCCASION_TILES[id] ?? []);
    const escapesOk =
      escapeIds.length === 0 ||
      skipped('escapes') ||
      escapeCats.some(picked) ||
      Object.values(svc.schedule).some((s) => s.date || s.time);

    const giftsOk = skipped(SURPRISE_GIFTS.id) || picked(SURPRISE_GIFTS.id);

    return celebrationsOk && escapesOk && giftsOk;
  },
);
