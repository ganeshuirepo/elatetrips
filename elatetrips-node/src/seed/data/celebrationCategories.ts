/** Picker categories, in display order. */
export const celebCategoryList = [
  { id: 'celebration', label: 'Celebration' },
  { id: 'rejuvenate', label: 'Escapes' },
];

/** Celebration id → picker category. Unlisted ids fall back to 'celebration'. */
export const celebrationCategories: Record<string, string> = {
  birthday: 'celebration',
  anniversary: 'celebration',
  honeymoon: 'celebration',
  wedding: 'celebration',
  bachelor: 'celebration',
  teamouting: 'celebration',
  family: 'rejuvenate',
  adventure: 'rejuvenate',
  leisure: 'rejuvenate',
  nature: 'rejuvenate',
};

export const celebCategoryFor = (id: string): string =>
  celebrationCategories[id] ?? 'celebration';
