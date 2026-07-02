/**
 * Configuration for the "Celebration services" step. Everything here is plain
 * data so each occasion's template — and the shared option grids — can be tuned
 * without touching the component. Per-occasion customisation will grow over time.
 */

import type { CelebCategory } from '@/domain/types';

export interface ServiceOption {
  id: string;
  label: string;
  icon: string;
  /** Card-tile copy (used by the package grids in the services step). */
  description?: string;
  /** "from" price in INR, shown on the tile. */
  price?: number;
  /** Carousel images for the tile, in order. */
  images?: string[];
  /** Details-modal content; missing lists fall back to generated defaults. */
  itinerary?: string[];
  inclusions?: string[];
  exclusions?: string[];
}

export interface PackageDetails {
  itinerary: string[];
  inclusions: string[];
  exclusions: string[];
}

/**
 * Details shown when a tile's "View details" is opened. Uses the option's own
 * lists where present, otherwise generates sensible, label-tailored defaults so
 * every tile has an itinerary, inclusions and exclusions out of the box.
 */
export const detailsFor = (o: ServiceOption): PackageDetails => {
  const name = o.label.toLowerCase();
  return {
    itinerary: o.itinerary ?? [
      'Planning call to confirm your preferences, timing and any add-ons.',
      `On-the-day setup and delivery of ${name} by our team.`,
      'Wrap-up and handover once the experience is complete.',
    ],
    inclusions: o.inclusions ?? [
      `${o.label} exactly as described`,
      'All equipment, materials and setup',
      'A dedicated on-ground coordinator',
    ],
    exclusions: o.exclusions ?? [
      'Applicable taxes and service fees',
      'Personal expenses and gratuities',
      'Anything not explicitly listed above',
    ],
  };
};

export interface ServiceCategory {
  id: string;
  label: string;
  sub: string;
  options: ServiceOption[];
}

/**
 * Time of day, one option per hour. Daytime runs 7 AM → midnight; the small
 * hours (1 AM–6 AM) are omitted as no celebration is scheduled then.
 */
export const TIME_OPTIONS: ServiceOption[] = [
  { id: '07:00', label: '7:00 AM', icon: 'ti-clock' },
  { id: '08:00', label: '8:00 AM', icon: 'ti-clock' },
  { id: '09:00', label: '9:00 AM', icon: 'ti-clock' },
  { id: '10:00', label: '10:00 AM', icon: 'ti-clock' },
  { id: '11:00', label: '11:00 AM', icon: 'ti-clock' },
  { id: '12:00', label: '12:00 PM', icon: 'ti-clock' },
  { id: '13:00', label: '1:00 PM', icon: 'ti-clock' },
  { id: '14:00', label: '2:00 PM', icon: 'ti-clock' },
  { id: '15:00', label: '3:00 PM', icon: 'ti-clock' },
  { id: '16:00', label: '4:00 PM', icon: 'ti-clock' },
  { id: '17:00', label: '5:00 PM', icon: 'ti-clock' },
  { id: '18:00', label: '6:00 PM', icon: 'ti-clock' },
  { id: '19:00', label: '7:00 PM', icon: 'ti-clock' },
  { id: '20:00', label: '8:00 PM', icon: 'ti-clock' },
  { id: '21:00', label: '9:00 PM', icon: 'ti-clock' },
  { id: '22:00', label: '10:00 PM', icon: 'ti-clock' },
  { id: '23:00', label: '11:00 PM', icon: 'ti-clock' },
  { id: '00:00', label: '12:00 AM', icon: 'ti-clock' },
];

/** No longer shown in the services step; retained for the voice assistant. */
export const VENUE_OPTIONS: ServiceOption[] = [
  { id: 'indoor', label: 'Indoor', icon: 'ti-building' },
  { id: 'outdoor', label: 'Outdoor', icon: 'ti-tree' },
  { id: 'both', label: 'No preference', icon: 'ti-arrows-shuffle' },
];

export const AGE_GROUPS: ServiceOption[] = [
  { id: 'kids', label: 'Kids · 0–12', icon: 'ti-mood-kid' },
  { id: 'youth', label: 'Youth · 13–25', icon: 'ti-mood-smile' },
  { id: 'adult', label: 'Adults · 26–55', icon: 'ti-users' },
  { id: 'senior', label: 'Seniors · 55+', icon: 'ti-armchair' },
];

export const GENDERS: ServiceOption[] = [
  { id: 'male', label: 'M', icon: 'ti-gender-male' },
  { id: 'female', label: 'F', icon: 'ti-gender-female' },
  { id: 'other', label: 'O', icon: 'ti-gender-bigender' },
];

export const MILESTONE_FOR: ServiceOption[] = [
  { id: 'individual', label: 'An individual', icon: 'ti-user-star' },
  { id: 'product', label: 'A product / brand', icon: 'ti-package' },
];

/** Shared multi-select categories, shown for every occasion. */
export const SHARED_CATEGORIES: ServiceCategory[] = [
  {
    id: 'decor',
    label: 'Decoration',
    sub: 'Set the scene',
    options: [
      {
        id: 'balloons',
        label: 'Balloon & theme',
        icon: 'ti-balloon',
        description: 'Themed balloon arches, backdrops and props styled to your colours.',
        price: 4999,
      },
      {
        id: 'flowers',
        label: 'Floral decor',
        icon: 'ti-flower',
        description: 'Fresh floral installations, table blooms and fragrant garlands.',
        price: 7499,
      },
      {
        id: 'stage',
        label: 'Stage & backdrop',
        icon: 'ti-photo',
        description: 'A custom stage and photo-ready backdrop for the big moment.',
        price: 9999,
      },
    ],
  },
  {
    id: 'onground',
    label: 'On-ground services',
    sub: 'The people who make it happen',
    options: [
      {
        id: 'photographer',
        label: 'Photographer',
        icon: 'ti-camera',
        description: 'A pro photographer to capture every candid and posed frame.',
        price: 5999,
      },
      {
        id: 'videographer',
        label: 'Videographer',
        icon: 'ti-video',
        description: 'Cinematic highlight film and full-event coverage in 4K.',
        price: 8999,
      },
      {
        id: 'makeup',
        label: 'Makeup artist',
        icon: 'ti-brush',
        description: 'On-location hair and makeup so you look camera-ready all day.',
        price: 6499,
      },
    ],
  },
  {
    id: 'food',
    label: 'Catering & food',
    sub: 'Menus and treats',
    options: [
      {
        id: 'cake',
        label: 'Custom cake',
        icon: 'ti-cake',
        description: 'A bespoke cake designed around your theme and flavours.',
        price: 2499,
      },
      {
        id: 'buffet',
        label: 'Buffet spread',
        icon: 'ti-tools-kitchen-2',
        description: 'A lavish multi-cuisine buffet with live chef stations.',
        price: 899,
      },
      {
        id: 'live',
        label: 'Live counters',
        icon: 'ti-chef-hat',
        description: 'Interactive counters — grills, chaat, pasta and dessert.',
        price: 1299,
      },
    ],
  },
  {
    id: 'music',
    label: 'Music & entertainment',
    sub: 'Set the mood',
    options: [
      {
        id: 'dj',
        label: 'DJ',
        icon: 'ti-disc',
        description: 'A resident DJ with full sound and lighting to fill the floor.',
        price: 11999,
      },
      {
        id: 'liveband',
        label: 'Live band',
        icon: 'ti-music',
        description: 'A live band playing your favourites across genres.',
        price: 18999,
      },
      {
        id: 'guitarist',
        label: 'Acoustic guitarist',
        icon: 'ti-guitar-pick',
        description: 'An intimate acoustic set for the softer moments.',
        price: 6999,
      },
    ],
  },
  {
    id: 'welcome',
    label: 'Welcome & extras',
    sub: 'First impressions',
    options: [
      {
        id: 'entry',
        label: 'Grand welcome entry',
        icon: 'ti-door-enter',
        description: 'A red-carpet welcome with dhol, flowers and fanfare.',
        price: 4499,
      },
      {
        id: 'drinks',
        label: 'Welcome drinks',
        icon: 'ti-glass',
        description: 'A signature mocktail and canapé reception on arrival.',
        price: 799,
      },
      {
        id: 'gifts',
        label: 'Return gifts',
        icon: 'ti-gift',
        description: 'Curated hampers to send every guest home happy.',
        price: 599,
      },
    ],
  },
];

/** Occasion-specific multi-select categories, keyed by their section id. */
export const SPECIAL_CATEGORIES: Record<string, ServiceCategory> = {
  romance: {
    id: 'romance',
    label: 'Romance & privacy',
    sub: 'Intimate, just the two of you',
    options: [
      {
        id: 'candlelight',
        label: 'Private candlelight dinner',
        icon: 'ti-candle',
        description: 'A secluded table for two, candlelit under the stars.',
        price: 5999,
      },
      {
        id: 'inroom',
        label: 'In-room romantic setup',
        icon: 'ti-bed',
        description: 'Petals, balloons and bubbly waiting in your suite.',
        price: 3499,
      },
      {
        id: 'spa',
        label: 'Couple spa',
        icon: 'ti-massage',
        description: 'A side-by-side signature massage and unwind ritual.',
        price: 4999,
      },
    ],
  },
  surprises: {
    id: 'surprises',
    label: 'Daily surprises',
    sub: 'A little something each day for each other',
    options: [
      {
        id: 'breakfast',
        label: 'Surprise breakfast',
        icon: 'ti-coffee',
        description: 'A floating or in-bed breakfast to start the day.',
        price: 1999,
      },
      {
        id: 'notes',
        label: 'Love notes & gifts',
        icon: 'ti-mail-heart',
        description: 'Hand-written notes and little gifts placed daily.',
        price: 1499,
      },
      {
        id: 'photoshoot',
        label: 'Surprise photoshoot',
        icon: 'ti-camera-heart',
        description: 'A candid couple shoot at a scenic spot.',
        price: 5499,
      },
    ],
  },
  menu: {
    id: 'menu',
    label: 'Menu palette',
    sub: 'How the night should taste',
    options: [
      {
        id: 'bbq',
        label: 'BBQ & grills',
        icon: 'ti-meat',
        description: 'Smoky live grills and skewers cooked to order.',
        price: 1299,
      },
      {
        id: 'finger',
        label: 'Finger food',
        icon: 'ti-pizza',
        description: 'Passed canapés and shareable bites all night.',
        price: 899,
      },
      {
        id: 'desserts',
        label: 'Dessert spread',
        icon: 'ti-cake',
        description: 'A decadent dessert table and live sweet counters.',
        price: 999,
      },
    ],
  },
  adventure: {
    id: 'adventure',
    label: 'Adventure activities',
    sub: 'Get the squad moving',
    options: [
      {
        id: 'trek',
        label: 'Trek / hike',
        icon: 'ti-mountain',
        description: 'A guided trail with the crew and a view at the top.',
        price: 1499,
      },
      {
        id: 'water',
        label: 'Water sports',
        icon: 'ti-swimming',
        description: 'Jet-skis, kayaks and banana boats by the shore.',
        price: 2499,
      },
      {
        id: 'bonfire',
        label: 'Bonfire night',
        icon: 'ti-campfire',
        description: 'A beach or hillside bonfire with music and snacks.',
        price: 1999,
      },
    ],
  },
  wellness: {
    id: 'wellness',
    label: 'Wellness',
    sub: 'Recharge, body and mind',
    options: [
      {
        id: 'spa',
        label: 'Spa & massage',
        icon: 'ti-massage',
        description: 'A signature massage and unwind ritual at the spa.',
        price: 3499,
      },
      {
        id: 'yoga',
        label: 'Yoga & meditation',
        icon: 'ti-yoga',
        description: 'Guided sunrise yoga and breathwork with a coach.',
        price: 1499,
      },
      {
        id: 'ayurveda',
        label: 'Ayurveda therapy',
        icon: 'ti-leaf',
        description: 'A consult and therapeutic treatment session.',
        price: 4299,
      },
    ],
  },
  local: {
    id: 'local',
    label: 'Local experiences',
    sub: 'Taste the place like a local',
    options: [
      {
        id: 'heritage',
        label: 'Heritage walk',
        icon: 'ti-building-monument',
        description: 'A guided stroll through old-town lanes and landmarks.',
        price: 899,
      },
      {
        id: 'cooking',
        label: 'Cooking class',
        icon: 'ti-tools-kitchen-2',
        description: 'Cook a regional meal with a local host, then feast.',
        price: 1499,
      },
      {
        id: 'foodtrail',
        label: 'Street-food trail',
        icon: 'ti-map-pin',
        description: 'A curated tasting crawl through the best local stalls.',
        price: 1199,
      },
    ],
  },
};

/**
 * Standalone "Surprise gifts" category. Not tied to any occasion — shown for
 * every trip regardless of the celebrations or escapes chosen.
 */
export const SURPRISE_GIFTS: ServiceCategory = {
  id: 'surprisegifts',
  label: 'Surprise gifts',
  sub: 'A thoughtful little extra',
  options: [
    {
      id: 'hamper',
      label: 'Gourmet hamper',
      icon: 'ti-gift',
      description: 'A curated box of artisanal treats and bubbly.',
      price: 1999,
    },
    {
      id: 'keepsake',
      label: 'Personalised keepsake',
      icon: 'ti-diamond',
      description: 'An engraved memento to remember the trip by.',
      price: 1499,
    },
    {
      id: 'blooms',
      label: 'Flowers & chocolates',
      icon: 'ti-flower',
      description: 'A hand-tied bouquet with premium chocolates.',
      price: 1299,
    },
  ],
};

/** Every category (shared + special + surprise gifts) keyed by id, for tile lookups. */
export const CATEGORY_BY_ID: Record<string, ServiceCategory> = Object.fromEntries(
  [...SHARED_CATEGORIES, ...Object.values(SPECIAL_CATEGORIES), SURPRISE_GIFTS].map((c) => [
    c.id,
    c,
  ]),
);

/** Section folder under /public/assets/services holding each category's tile photos. */
const CATEGORY_FOLDER: Record<string, string> = {
  decor: 'celebration',
  onground: 'celebration',
  food: 'celebration',
  music: 'celebration',
  welcome: 'celebration',
  romance: 'celebration',
  surprises: 'celebration',
  menu: 'celebration',
  adventure: 'escapes',
  wellness: 'escapes',
  local: 'escapes',
  surprisegifts: 'gifts',
};

// Attach each tile's carousel photos (two per tile) from its section folder,
// named by option id: /assets/services/<folder>/<optionId>-{1,2}.jpg.
for (const cat of [...SHARED_CATEGORIES, ...Object.values(SPECIAL_CATEGORIES), SURPRISE_GIFTS]) {
  const folder = CATEGORY_FOLDER[cat.id];
  if (!folder) continue;
  for (const o of cat.options) {
    o.images = [1, 2].map((n) => `/assets/services/${folder}/${o.id}-${n}.jpg`);
  }
}

/**
 * Package-tile categories per picker bucket — the default for celebrations. Tiles
 * are wrapped into every occasion's own block rather than shown as trip-wide
 * sections; celebrations get the full party stack.
 */
export const TILE_CATEGORIES: Record<CelebCategory, string[]> = {
  celebration: ['decor', 'onground', 'food', 'music', 'welcome'],
  rejuvenate: ['adventure'],
};

/**
 * Per-occasion tile overrides. Escapes each map to a single themed category, so
 * their block shows one focused tile grid (no category filter) and schedules each
 * experience on its own day/time.
 */
export const OCCASION_TILES: Record<string, string[]> = {
  family: ['wellness'],
  adventure: ['adventure'],
  nature: ['local'],
};

export interface CelebTemplate {
  /** Heading shown for this occasion's block. */
  title: string;
  blurb: string;
  /** Which shared inputs to ask. */
  date: boolean;
  time: boolean;
  age: boolean;
  gender: boolean;
  /** Ordered ids of special sections to render (keys of SPECIAL_CATEGORIES, or 'milestoneFor'). */
  sections: string[];
}

/** Per-occasion templates. Unlisted occasions fall back to DEFAULT_TEMPLATE. */
export const CELEB_TEMPLATES: Record<string, CelebTemplate> = {
  birthday: {
    title: 'Birthday',
    blurb: 'Tell us whose big day it is so we tailor the vibe.',
    date: true,
    time: true,
    age: true,
    gender: true,
    sections: [],
  },
  anniversary: {
    title: 'Anniversary',
    blurb: 'Intimate and romantic — built around the two of you.',
    date: true,
    time: true,
    age: false,
    gender: false,
    sections: ['romance'],
  },
  teamouting: {
    title: 'Proposal',
    blurb: 'A private, once-in-a-lifetime moment — kept a surprise.',
    date: true,
    time: true,
    age: false,
    gender: false,
    sections: ['romance'],
  },
  honeymoon: {
    title: 'Honeymoon',
    blurb: 'No fixed date — just daily surprises across your stay.',
    date: false,
    time: true,
    age: false,
    gender: false,
    sections: ['surprises', 'romance'],
  },
  bachelor: {
    title: 'Bachelor party',
    blurb: 'Big energy — menu, adventure and the full package.',
    date: true,
    time: true,
    age: false,
    gender: false,
    sections: ['menu', 'adventure'],
  },
  milestone: {
    title: 'Milestone',
    blurb: 'A landmark moment for someone — or something — special.',
    date: true,
    time: true,
    age: false,
    gender: false,
    sections: ['milestoneFor'],
  },
};

export const DEFAULT_TEMPLATE: CelebTemplate = {
  title: 'Celebration',
  blurb: 'Tell us the basics and pick the services you want.',
  date: true,
  time: true,
  age: false,
  gender: false,
  sections: [],
};

export const templateFor = (celebId: string): CelebTemplate =>
  CELEB_TEMPLATES[celebId] ?? DEFAULT_TEMPLATE;
