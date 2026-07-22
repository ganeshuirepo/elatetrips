import type { ExperienceFacet } from '../../modules/catalog/catalog.types';

/**
 * The local-experience filters offered on the packages screen.
 *
 * A facet is OFFERED for a place only when a package there carries one of its
 * tags, so this list is the full vocabulary and the place decides what a
 * traveller actually sees: Goa surfaces "Water sports & beach", Ooty surfaces
 * "Treks & sunrise hikes". Tagging a new package is all it takes to light a
 * facet up — no code change.
 *
 * `tags` are the canonical experience tags used by the package template in
 * seed/data/celebrationBundles.ts.
 */
export const experienceFacets: ExperienceFacet[] = [
  { id: 'trek', label: 'Treks & sunrise hikes', icon: '🥾', tags: ['trek'], order: 10 },
  { id: 'water', label: 'Water sports & beach', icon: '🏄', tags: ['water'], order: 20 },
  { id: 'camp', label: 'Camping & bonfires', icon: '⛺', tags: ['camp', 'bonfire'], order: 30 },
  { id: 'tea', label: 'Tea & plantation trails', icon: '🍃', tags: ['tea'], order: 40 },
  { id: 'picnic', label: 'Forest picnics', icon: '🧺', tags: ['picnic'], order: 50 },
  { id: 'food', label: 'Food trails & tastings', icon: '🍜', tags: ['food', 'dining'], order: 60 },
  { id: 'culture', label: 'Culture & heritage', icon: '🎭', tags: ['culture'], order: 70 },
  { id: 'wellness', label: 'Spa & wellness', icon: '🧘', tags: ['spa'], order: 80 },
  { id: 'kids', label: 'Kids & family', icon: '🎈', tags: ['kids'], order: 90 },
  { id: 'photo', label: 'Photoshoots', icon: '📸', tags: ['photoshoot'], order: 100 },
];
