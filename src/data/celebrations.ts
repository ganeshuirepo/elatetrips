import type { Celebration, CelebCategory } from '@/domain/types';

/** Picker categories, in display order. New categories slot in here. */
export const CELEB_CATEGORY_META: { id: CelebCategory; label: string; sub: string }[] = [
  { id: 'celebration', label: 'Celebration', sub: 'Mark a special moment' },
  { id: 'rejuvenate', label: 'Escapes', sub: 'Recharge, explore & unwind' },
];

/** Default imagery per celebration (keyword-matched stock); users may swap any slot. */
export const CELEBRATIONS: Celebration[] = [
  {
    id: 'birthday',
    name: 'Birthday',
    icon: 'ti-cake',
    img: '/assets/celeb-birthday.png',
    category: 'celebration',
  },
  {
    id: 'anniversary',
    name: 'Anniversary',
    icon: 'ti-heart',
    img: '/assets/celeb-anniversary.png',
    category: 'celebration',
  },
  {
    id: 'honeymoon',
    name: 'Honeymoon',
    icon: 'ti-flower',
    img: '/assets/celeb-honeymoon.png',
    category: 'celebration',
  },
  {
    id: 'bachelor',
    name: 'Bachelor Party',
    icon: 'ti-confetti',
    img: '/assets/celeb-bachelor.png',
    category: 'celebration',
  },
  {
    id: 'teamouting',
    name: 'Proposal',
    icon: 'ti-diamond',
    img: '/assets/celeb-teamouting.png',
    category: 'celebration',
  },
  {
    id: 'milestone',
    name: 'Milestone',
    icon: 'ti-award',
    img: '/assets/celeb-anniversary.png',
    category: 'celebration',
  },
  {
    id: 'culture',
    name: 'Culture',
    icon: 'ti-building-monument',
    img: '/assets/celeb-adventure.png',
    category: 'celebration',
  },
  {
    id: 'conference',
    name: 'Conference',
    icon: 'ti-presentation',
    img: '/assets/celeb-teamouting.png',
    category: 'celebration',
  },
  {
    id: 'family',
    name: 'Wellness',
    icon: 'ti-yoga',
    img: '/assets/celeb-family.png',
    category: 'rejuvenate',
  },
  {
    id: 'adventure',
    name: 'Adventure',
    icon: 'ti-mountain',
    img: '/assets/celeb-adventure.png',
    category: 'rejuvenate',
  },
  {
    id: 'leisure',
    name: 'Leisure',
    icon: 'ti-umbrella',
    img: '/assets/celeb-honeymoon.png',
    category: 'rejuvenate',
  },
  {
    id: 'nature',
    name: 'Nature Escape',
    icon: 'ti-trees',
    img: '/assets/celeb-adventure.png',
    category: 'rejuvenate',
  },
];

/**
 * Which occasions may be booked together. A valid selection must sit entirely
 * within ONE group:
 *  - Celebration items combine among themselves.
 *  - Escapes (the four 'rejuvenate' occasions) combine only with each other and
 *    never with a Celebration item.
 * Items in CELEB_EXCLUSIVE cannot be combined with anything else.
 */
export const CELEB_GROUPS: string[][] = [
  // Celebration (excl. exclusives)
  ['birthday', 'anniversary', 'honeymoon', 'bachelor', 'milestone', 'culture', 'conference'],
  ['family', 'adventure', 'leisure', 'nature'], // Escapes — self-contained
];

/** Occasions that must be booked on their own: Proposal. */
export const CELEB_EXCLUSIVE: string[] = ['teamouting'];
