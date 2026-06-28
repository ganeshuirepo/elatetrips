/** Distinct package categories, in display order. */
export const packageCategoryList = [
  'Decoration',
  'Food',
  'Music',
  'Entertainment',
  'Wellness',
  'Photography',
];

/** Each package name's category. Unlisted names fall back to 'Decoration'. */
export const packageCategories: Record<string, string> = {
  'Cake & decoration': 'Decoration',
  'Birthday photoshoot': 'Photography',
  'Surprise party setup': 'Decoration',
  'Magician show': 'Entertainment',
  'Kids activities': 'Entertainment',
  'Live guitarist': 'Music',
  'Custom dishes': 'Food',
  'Special welcome entry': 'Decoration',
  'Candlelight dinner': 'Food',
  'In-room decoration': 'Decoration',
  'Couple photoshoot': 'Photography',
  'Couple spa': 'Wellness',
  'Party night setup': 'Entertainment',
  'Live music': 'Music',
  'Bonfire & BBQ': 'Food',
  'Spa & massage': 'Wellness',
  'Yoga session': 'Wellness',
  'Meditation retreat': 'Wellness',
  'Wellness cuisine': 'Food',
  'Celebration dinner': 'Food',
  'Felicitation decor': 'Decoration',
  Photoshoot: 'Photography',
  'Private dinner in room': 'Food',
  'Proposal photoshoot': 'Photography',
};

export const categoryFor = (name: string): string => packageCategories[name] ?? 'Decoration';
