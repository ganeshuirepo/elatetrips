import type { AgeRange } from '@/domain/types';

/** Celebration → list of offered package names. */
export const PKGS: Record<string, string[]> = {
  birthday: [
    'Cake & decoration',
    'Birthday photoshoot',
    'Surprise party setup',
    'Magician show',
    'Kids activities',
    'Live guitarist',
    'Custom dishes',
    'Special welcome entry',
  ],
  anniversary: [
    'Candlelight dinner',
    'In-room decoration',
    'Couple photoshoot',
    'Live guitarist',
    'Custom dishes',
    'Special welcome entry',
  ],
  honeymoon: [
    'In-room decoration',
    'Candlelight dinner',
    'Couple spa',
    'Live guitarist',
    'Custom dishes',
    'Special welcome entry',
  ],
  wedding: ['Stage & mandap decor', 'Wedding photoshoot', 'Catering setup'],
  bachelor: ['Party night setup', 'Live music', 'Bonfire & BBQ', 'Magician show', 'Custom dishes'],
  family: [
    'Spa & massage',
    'Yoga session',
    'Meditation retreat',
    'Wellness cuisine',
    'Custom dishes',
  ],
  adventure: [
    'Celebration dinner',
    'Felicitation decor',
    'Photoshoot',
    'Live guitarist',
    'Custom dishes',
    'Special welcome entry',
  ],
  teamouting: [
    'Private dinner in room',
    'In-room decoration',
    'Proposal photoshoot',
    'Magician show',
    'Custom dishes',
    'Special welcome entry',
  ],
  leisure: ['Candlelight dinner', 'Live music', 'Custom dishes', 'Special welcome entry'],
  nature: ['Bonfire & BBQ', 'Live music', 'Spa & massage', 'Custom dishes'],
};

/** Per-package price (₹). Shared names share a price. */
export const PKG_PRICE: Record<string, number> = {
  'Cake & decoration': 2500,
  'Birthday photoshoot': 4000,
  'Surprise party setup': 6000,
  'Magician show': 8000,
  'Kids activities': 3500,
  'Live guitarist': 7000,
  'Custom dishes': 3000,
  'Special welcome entry': 2000,
  'Candlelight dinner': 5000,
  'In-room decoration': 3500,
  'Couple photoshoot': 4500,
  'Couple spa': 6000,
  'Party night setup': 9000,
  'Live music': 12000,
  'Bonfire & BBQ': 7500,
  'Spa & massage': 5000,
  'Yoga session': 2000,
  'Meditation retreat': 4000,
  'Wellness cuisine': 3000,
  'Celebration dinner': 5500,
  'Felicitation decor': 3500,
  Photoshoot: 4000,
  'Private dinner in room': 6500,
  'Proposal photoshoot': 5000,
};

export const PKG_ICON: Record<string, string> = {
  'Cake & decoration': 'ti-cake',
  'Birthday photoshoot': 'ti-camera',
  'Surprise party setup': 'ti-confetti',
  'Magician show': 'ti-wand',
  'Kids activities': 'ti-mood-kid',
  'Live guitarist': 'ti-music',
  'Custom dishes': 'ti-tools-kitchen-2',
  'Special welcome entry': 'ti-door-enter',
  'Candlelight dinner': 'ti-candle',
  'In-room decoration': 'ti-balloon',
  'Couple photoshoot': 'ti-camera',
  'Couple spa': 'ti-massage',
  'Party night setup': 'ti-confetti',
  'Live music': 'ti-music',
  'Bonfire & BBQ': 'ti-campfire',
  'Spa & massage': 'ti-massage',
  'Yoga session': 'ti-yoga',
  'Meditation retreat': 'ti-flower',
  'Wellness cuisine': 'ti-salad',
  'Celebration dinner': 'ti-glass-full',
  'Felicitation decor': 'ti-award',
  Photoshoot: 'ti-camera',
  'Private dinner in room': 'ti-tools-kitchen-2',
  'Proposal photoshoot': 'ti-diamond',
};

export const PKG_DESC: Record<string, string> = {
  'Cake & decoration': 'Cake + theme decor',
  'Birthday photoshoot': 'Pro photographer, 1 hr',
  'Surprise party setup': 'Full surprise arrangement',
  'Magician show': '30-min live act',
  'Kids activities': 'Games & entertainment',
  'Live guitarist': 'Acoustic live set',
  'Custom dishes': 'Personalised menu',
  'Special welcome entry': 'Grand arrival setup',
  'Candlelight dinner': 'Romantic table setup',
  'In-room decoration': 'Flowers, balloons & lights',
  'Couple photoshoot': 'Pro photographer, 1 hr',
  'Couple spa': 'Couples massage',
  'Party night setup': 'DJ, lights & décor',
  'Live music': 'Live band performance',
  'Bonfire & BBQ': 'Evening bonfire + grill',
  'Spa & massage': 'Relaxation therapy',
  'Yoga session': 'Guided morning yoga',
  'Meditation retreat': 'Guided mindfulness',
  'Wellness cuisine': 'Healthy curated meals',
  'Celebration dinner': 'Special group dinner',
  'Felicitation decor': 'Stage & honours setup',
  Photoshoot: 'Pro photographer, 1 hr',
  'Private dinner in room': 'In-room fine dining',
  'Proposal photoshoot': 'Candid proposal capture',
};

export const PKG_INCLUDES: Record<string, string[]> = {
  'Cake & decoration': [
    '1–2 kg designer cake',
    'Themed balloon & light decor',
    'Set up before you arrive',
  ],
  'Birthday photoshoot': [
    'Professional photographer, 1 hr',
    '40+ edited photos',
    'Online gallery delivery',
  ],
  'Surprise party setup': [
    'Full surprise room decor',
    'Coordination with hotel staff',
    'Banner, balloons & lighting',
  ],
  'Magician show': ['30-minute live magic act', 'Close-up & stage tricks', 'Suitable for all ages'],
  'Kids activities': ['Supervised games & play', 'Activity host & materials', '2-hour engagement'],
  'Live guitarist': ['Acoustic live performance', 'Curated song requests', '45-minute set'],
  'Custom dishes': [
    'Personalised menu planning',
    'Chef-prepared specials',
    'Dietary preferences honoured',
  ],
  'Special welcome entry': ['Grand arrival decor', 'Welcome drinks', 'Garland / petal welcome'],
  'Candlelight dinner': ['Private candlelit table', '3-course set menu', 'Romantic ambience setup'],
  'In-room decoration': [
    'Flowers, balloons & fairy lights',
    'Personalised message banner',
    'Pre-arrival setup',
  ],
  'Couple photoshoot': [
    'Professional photographer, 1 hr',
    '40+ edited photos',
    'Scenic location guidance',
  ],
  'Couple spa': ['Couples massage session', 'Aromatherapy & relaxation', '60-minute therapy'],
  'Party night setup': [
    'DJ with sound system',
    'Lighting & dance-floor decor',
    'Late-night arrangement',
  ],
  'Live music': ['Live band performance', 'Curated playlist', '90-minute show'],
  'Bonfire & BBQ': ['Evening bonfire setup', 'Live BBQ grill & snacks', 'Seating & ambience'],
  'Spa & massage': ['Relaxation therapy session', 'Trained therapists', 'Aroma oils included'],
  'Yoga session': ['Guided morning yoga', 'Certified instructor', 'Mats & props provided'],
  'Meditation retreat': [
    'Guided mindfulness session',
    'Breathing techniques',
    'Calm outdoor setting',
  ],
  'Wellness cuisine': ['Healthy curated meals', 'Nutritionist-planned menu', 'Fresh local produce'],
  'Celebration dinner': ['Special group dinner', 'Reserved seating', 'Customised menu'],
  'Felicitation decor': [
    'Stage & backdrop setup',
    'Honours & awards arrangement',
    'Photo-ready decor',
  ],
  Photoshoot: ['Professional photographer, 1 hr', '40+ edited photos', 'Online gallery delivery'],
  'Private dinner in room': [
    'In-room fine dining',
    'Dedicated server',
    'Curated multi-course menu',
  ],
  'Proposal photoshoot': [
    'Candid proposal capture',
    'Hidden photographer setup',
    'Edited photo gallery',
  ],
};

/** Age-gated packages (inclusive year ranges). Unlisted packages suit any age. */
export const PKG_AGE: Record<string, AgeRange> = {
  'Kids activities': [0, 12],
  'Magician show': [0, 15],
  'Live guitarist': [13, 200],
  'Candlelight dinner': [18, 200],
  'Couple spa': [18, 200],
};

/** Distinct package categories, in display order (used by the package filters). */
export const PKG_CATEGORIES = [
  'Decoration',
  'Food',
  'Music',
  'Entertainment',
  'Wellness',
  'Photography',
] as const;

export type PkgCategory = (typeof PKG_CATEGORIES)[number];

/** Each package's category. Unlisted names fall back to 'Decoration'. */
export const PKG_CATEGORY: Record<string, PkgCategory> = {
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
  // Wedding-form packages (shown via the dedicated wedding flow).
  'Stage & mandap decor': 'Decoration',
  'Wedding photoshoot': 'Photography',
  'Catering setup': 'Food',
};

/** Category for a package name, with a safe fallback. */
export const pkgCategory = (name: string): PkgCategory => PKG_CATEGORY[name] ?? 'Decoration';
