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
    id: 'group',
    name: 'Group',
    icon: 'ti-users-group',
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
    id: 'nature',
    name: 'Local experiences',
    icon: 'ti-map-pin',
    img: '/assets/celeb-adventure.png',
    category: 'rejuvenate',
  },
];

/**
 * Combination rules:
 *  - Wedding has its own flow and never combines with anything.
 *  - Honeymoon, Bachelor, Proposal and Group are "solo" celebrations: each must
 *    be the ONLY celebration chosen — Escapes may still be added alongside.
 *  - Birthday and Anniversary combine freely with each other.
 *  - Escapes (the 'rejuvenate' occasions) are unrestricted: any number, with
 *    each other and with any celebration selection.
 */

/** Occasions that cannot be combined with anything else. */
export const CELEB_EXCLUSIVE: string[] = ['wedding'];

/** Celebrations that must be the only *celebration* chosen (escapes may be added). */
export const CELEB_SOLO: string[] = ['honeymoon', 'bachelor', 'teamouting', 'group'];

/** Escape (rejuvenate) occasion ids — combine freely with each other and any celebration. */
export const ESCAPE_IDS: string[] = CELEBRATIONS.filter((c) => c.category === 'rejuvenate').map(
  (c) => c.id,
);
