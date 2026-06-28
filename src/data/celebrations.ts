import type { Celebration, CelebCategory } from '@/domain/types';

/**
 * Picker categories, in display order. New categories slot in here.
 *
 * `iconBg` / `iconBgActive` are multi-stop gradients for the tile icon swatch
 * (resting / selected). They are built from theme tokens so they re-tint with
 * every palette; `iconInk` keeps the glyph legible on the resting gradient.
 */
export const CELEB_CATEGORY_META: {
  id: CelebCategory;
  label: string;
  sub: string;
  iconBg: string;
  iconBgActive: string;
  iconInk: string;
}[] = [
  {
    id: 'celebration',
    label: 'Celebration',
    sub: 'Mark a special moment',
    iconBg:
      'linear-gradient(135deg, color-mix(in srgb, var(--accent) 24%, #fff), color-mix(in srgb, var(--primary) 16%, #fff))',
    iconBgActive: 'linear-gradient(135deg, var(--accent), var(--accent-ink))',
    iconInk: 'var(--accent-ink)',
  },
  {
    id: 'rejuvenate',
    label: 'Escapes',
    sub: 'Recharge, explore & unwind',
    iconBg:
      'linear-gradient(135deg, color-mix(in srgb, var(--primary) 22%, #fff), var(--sand))',
    iconBgActive: 'linear-gradient(135deg, var(--primary), var(--accent))',
    iconInk: 'var(--primary)',
  },
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
