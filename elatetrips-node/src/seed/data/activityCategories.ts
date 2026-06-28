/** Distinct activity categories, in display order. */
export const activityCategoryList = [
  'Land',
  'Water',
  'Aerial',
  'Nature',
  'Tours',
  'Food',
  'Arts',
  'Culture',
  'Family',
];

/** Activity (adventure/experience) id → category. Unlisted ids fall back to 'Land'. */
export const activityCategories: Record<string, string> = {
  // Adventures
  trek: 'Land',
  raft: 'Water',
  zip: 'Aerial',
  atv: 'Land',
  para: 'Aerial',
  camp: 'Nature',
  // Experiences
  sight: 'Tours',
  food: 'Food',
  workshop: 'Arts',
  culture: 'Culture',
  dining: 'Food',
  kids: 'Family',
};

export const activityCategoryFor = (id: string): string => activityCategories[id] ?? 'Land';
