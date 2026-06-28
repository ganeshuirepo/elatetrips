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
    id: 'wedding',
    name: 'Wedding',
    icon: 'ti-glass-full',
    img: '/assets/celeb-wedding.png',
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
 * Which celebrations may be combined. 'family' (Wellness) is in both groups so
 * it bridges either set. 'teamouting' (Proposal) is exclusive — it cannot be
 * combined with anything.
 */
export const CELEB_GROUPS: string[][] = [
  ['birthday', 'anniversary', 'adventure', 'family', 'leisure', 'nature'],
  ['wedding', 'honeymoon', 'family', 'bachelor', 'leisure', 'nature'],
];
