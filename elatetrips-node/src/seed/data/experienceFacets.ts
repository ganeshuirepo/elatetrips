import type { ExperienceFacet } from '../../modules/catalog/catalog.types';

/**
 * The place-aware filters offered on the packages screen, across TWO axes:
 *
 *   - group 'activity'   — active things you DO, run by operators/centres:
 *                          adventure treks, water sports, camping, kids' play.
 *   - group 'experience' — curated local/celebration experiences included in
 *                          the package: tea trails, picnics, food, culture,
 *                          spa, a photoshoot.
 *
 * The frontend renders one filter per group ("Activities" and "Experiences").
 *
 * A facet is OFFERED for a place only when a package there carries one of its
 * `tags`, so this list is the full vocabulary and the place decides what a
 * traveller actually sees: Goa surfaces "Water sports", Ooty surfaces "Treks".
 * Tagging a new package is all it takes to light a facet up — no code change.
 *
 * `tags` are the canonical experience tags used by the package template in
 * seed/data/celebrationBundles.ts. `order` sorts within a group.
 */
export const experienceFacets: ExperienceFacet[] = [
  // Activities — active, operator-run (adventure, water, camping, kids).
  { id: 'trek', group: 'activity', label: 'Treks & sunrise hikes', icon: '🥾', tags: ['trek'], order: 10 },
  { id: 'water', group: 'activity', label: 'Water sports & beach', icon: '🏄', tags: ['water'], order: 20 },
  { id: 'camp', group: 'activity', label: 'Camping & bonfires', icon: '⛺', tags: ['camp', 'bonfire'], order: 30 },
  { id: 'kids', group: 'activity', label: 'Kids & family', icon: '🎈', tags: ['kids'], order: 40 },
  // Experiences — curated local/celebration inclusions.
  { id: 'tea', group: 'experience', label: 'Tea & plantation trails', icon: '🍃', tags: ['tea'], order: 50 },
  { id: 'picnic', group: 'experience', label: 'Forest picnics', icon: '🧺', tags: ['picnic'], order: 60 },
  { id: 'food', group: 'experience', label: 'Food trails & tastings', icon: '🍜', tags: ['food', 'dining'], order: 70 },
  { id: 'culture', group: 'experience', label: 'Culture & heritage', icon: '🎭', tags: ['culture'], order: 80 },
  { id: 'wellness', group: 'experience', label: 'Spa & wellness', icon: '🧘', tags: ['spa'], order: 90 },
  { id: 'photo', group: 'experience', label: 'Photoshoots', icon: '📸', tags: ['photoshoot'], order: 100 },
];
