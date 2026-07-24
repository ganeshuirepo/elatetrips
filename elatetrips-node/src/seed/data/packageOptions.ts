import type { PackageOption } from '../../modules/catalog/catalog.types';

/**
 * Priced customization tiers for a celebration package, shown on the plan page.
 *
 * Four single-select groups; the frontend presents them as THREE sections —
 * Decoration, Hotels (star + room together) and Cab. Each group's first tier is
 * the included baseline (priceDelta 0); higher tiers add a flat amount to the
 * package total. These are global product tiers (not per-place, not per-package)
 * — the celebration business edits them here, one source of truth.
 */
export const packageOptions: PackageOption[] = [
  // Decoration / surprise — how the room and reveal are staged.
  { id: 'decor-essential', group: 'decoration', label: 'Essential decor', note: 'Balloons, banner & a dressed table', priceDelta: 0, order: 10 },
  { id: 'decor-signature', group: 'decoration', label: 'Signature surprise', note: 'Floral arch, candle path & a hidden reveal', priceDelta: 3500, order: 20 },
  { id: 'decor-grand', group: 'decoration', label: 'Grand celebration', note: 'Full room styling, stage & a photographer', priceDelta: 9000, order: 30 },

  // Hotel star rating.
  { id: 'star-3', group: 'star', label: '3-star stay', note: 'Comfortable & spotless', priceDelta: 0, order: 10 },
  { id: 'star-4', group: 'star', label: '4-star stay', note: 'Premium comfort & service', priceDelta: 2000, order: 20 },
  { id: 'star-5', group: 'star', label: '5-star stay', note: 'Luxury property', priceDelta: 5500, order: 30 },

  // Room package.
  { id: 'room-cozy', group: 'room', label: 'Cozy room', note: 'Comfortable base room', priceDelta: 0, order: 10 },
  { id: 'room-deluxe', group: 'room', label: 'Deluxe room', note: 'More space, better view', priceDelta: 2500, order: 20 },
  { id: 'room-suite', group: 'room', label: 'Private suite', note: 'Suite with a living area', priceDelta: 6000, order: 30 },

  // Cab / transport scope.
  { id: 'cab-skip', group: 'cab', label: 'Skip — own vehicle', note: 'No cab needed', priceDelta: 0, order: 10 },
  { id: 'cab-local', group: 'cab', label: 'Local rides', note: 'Cab for local sightseeing', priceDelta: 1800, order: 20 },
  { id: 'cab-full', group: 'cab', label: 'Full trip', note: 'Airport pickup + all transfers', priceDelta: 4200, order: 30 },
];
