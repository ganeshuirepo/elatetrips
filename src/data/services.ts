/**
 * Configuration for the "Celebration services" step. Everything here is plain
 * data so each occasion's template — and the shared option grids — can be tuned
 * without touching the component. Per-occasion customisation will grow over time.
 */

export interface ServiceOption {
  id: string;
  label: string;
  icon: string;
}

export interface ServiceCategory {
  id: string;
  label: string;
  sub: string;
  options: ServiceOption[];
}

/** Single-select chip groups. */
export const TIME_OPTIONS: ServiceOption[] = [
  { id: 'morning', label: 'Morning', icon: 'ti-sunrise' },
  { id: 'afternoon', label: 'Afternoon', icon: 'ti-sun' },
  { id: 'evening', label: 'Evening', icon: 'ti-sunset' },
  { id: 'night', label: 'Night', icon: 'ti-moon' },
];

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
  { id: 'any', label: 'Any', icon: 'ti-friends' },
  { id: 'female', label: 'Female', icon: 'ti-gender-female' },
  { id: 'male', label: 'Male', icon: 'ti-gender-male' },
  { id: 'other', label: 'Other', icon: 'ti-gender-bigender' },
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
      { id: 'balloons', label: 'Balloon & theme', icon: 'ti-balloon' },
      { id: 'flowers', label: 'Floral decor', icon: 'ti-flower' },
      { id: 'stage', label: 'Stage & backdrop', icon: 'ti-photo' },
      { id: 'lighting', label: 'Lighting', icon: 'ti-bulb' },
      { id: 'table', label: 'Table styling', icon: 'ti-glass-full' },
    ],
  },
  {
    id: 'onground',
    label: 'On-ground services',
    sub: 'The people who make it happen',
    options: [
      { id: 'photographer', label: 'Photographer', icon: 'ti-camera' },
      { id: 'videographer', label: 'Videographer', icon: 'ti-video' },
      { id: 'makeup', label: 'Makeup artist', icon: 'ti-brush' },
      { id: 'host', label: 'Host / anchor', icon: 'ti-microphone' },
      { id: 'security', label: 'Security & help', icon: 'ti-shield' },
    ],
  },
  {
    id: 'food',
    label: 'Catering & food',
    sub: 'Menus and treats',
    options: [
      { id: 'cake', label: 'Custom cake', icon: 'ti-cake' },
      { id: 'buffet', label: 'Buffet spread', icon: 'ti-tools-kitchen-2' },
      { id: 'plated', label: 'Plated dinner', icon: 'ti-bowl' },
      { id: 'live', label: 'Live counters', icon: 'ti-chef-hat' },
      { id: 'bar', label: 'Bar & mocktails', icon: 'ti-glass' },
    ],
  },
  {
    id: 'music',
    label: 'Music & entertainment',
    sub: 'Set the mood',
    options: [
      { id: 'dj', label: 'DJ', icon: 'ti-disc' },
      { id: 'liveband', label: 'Live band', icon: 'ti-music' },
      { id: 'guitarist', label: 'Acoustic guitarist', icon: 'ti-guitar-pick' },
      { id: 'magician', label: 'Magician', icon: 'ti-wand' },
    ],
  },
  {
    id: 'welcome',
    label: 'Welcome & extras',
    sub: 'First impressions',
    options: [
      { id: 'entry', label: 'Grand welcome entry', icon: 'ti-door-enter' },
      { id: 'drinks', label: 'Welcome drinks', icon: 'ti-glass' },
      { id: 'petals', label: 'Petal / garland', icon: 'ti-flower' },
      { id: 'gifts', label: 'Return gifts', icon: 'ti-gift' },
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
      { id: 'candlelight', label: 'Private candlelight dinner', icon: 'ti-candle' },
      { id: 'inroom', label: 'In-room romantic setup', icon: 'ti-bed' },
      { id: 'spa', label: 'Couple spa', icon: 'ti-massage' },
      { id: 'secluded', label: 'Secluded table', icon: 'ti-heart' },
      { id: 'cruise', label: 'Private cruise / cabana', icon: 'ti-sailboat' },
    ],
  },
  surprises: {
    id: 'surprises',
    label: 'Daily surprises',
    sub: 'A little something each day for each other',
    options: [
      { id: 'breakfast', label: 'Surprise breakfast', icon: 'ti-coffee' },
      { id: 'notes', label: 'Love notes & gifts', icon: 'ti-mail-heart' },
      { id: 'photoshoot', label: 'Surprise photoshoot', icon: 'ti-camera-heart' },
      { id: 'flowers', label: 'Daily flowers', icon: 'ti-flower' },
      { id: 'experience', label: 'Mystery experience', icon: 'ti-gift' },
    ],
  },
  menu: {
    id: 'menu',
    label: 'Menu palette',
    sub: 'How the night should taste',
    options: [
      { id: 'bbq', label: 'BBQ & grills', icon: 'ti-meat' },
      { id: 'finger', label: 'Finger food', icon: 'ti-pizza' },
      { id: 'premiumbar', label: 'Premium bar', icon: 'ti-glass' },
      { id: 'desserts', label: 'Dessert spread', icon: 'ti-cake' },
      { id: 'street', label: 'Street-food counters', icon: 'ti-tools-kitchen-2' },
    ],
  },
  adventure: {
    id: 'adventure',
    label: 'Adventure activities',
    sub: 'Get the squad moving',
    options: [
      { id: 'trek', label: 'Trek / hike', icon: 'ti-mountain' },
      { id: 'water', label: 'Water sports', icon: 'ti-swimming' },
      { id: 'bonfire', label: 'Bonfire night', icon: 'ti-campfire' },
      { id: 'biking', label: 'Biking', icon: 'ti-bike' },
      { id: 'games', label: 'Group games', icon: 'ti-device-gamepad' },
    ],
  },
};

export interface CelebTemplate {
  /** Heading shown for this occasion's block. */
  title: string;
  blurb: string;
  /** Which shared inputs to ask. */
  date: boolean;
  time: boolean;
  guests: boolean;
  age: boolean;
  gender: boolean;
  /** Ordered ids of special sections to render (keys of SPECIAL_CATEGORIES, or 'ageGroup' / 'milestoneFor'). */
  sections: string[];
}

/** Per-occasion templates. Unlisted occasions fall back to DEFAULT_TEMPLATE. */
export const CELEB_TEMPLATES: Record<string, CelebTemplate> = {
  birthday: {
    title: 'Birthday',
    blurb: 'Tell us whose big day it is so we tailor the vibe.',
    date: true,
    time: true,
    guests: true,
    age: true,
    gender: true,
    sections: ['ageGroup'],
  },
  anniversary: {
    title: 'Anniversary',
    blurb: 'Intimate and romantic — built around the two of you.',
    date: true,
    time: true,
    guests: true,
    age: false,
    gender: false,
    sections: ['romance'],
  },
  honeymoon: {
    title: 'Honeymoon',
    blurb: 'No fixed date — just daily surprises across your stay.',
    date: false,
    time: true,
    guests: false,
    age: false,
    gender: false,
    sections: ['surprises', 'romance'],
  },
  bachelor: {
    title: 'Bachelor party',
    blurb: 'Big energy — menu, adventure and the full package.',
    date: true,
    time: true,
    guests: true,
    age: false,
    gender: false,
    sections: ['menu', 'adventure'],
  },
  milestone: {
    title: 'Milestone',
    blurb: 'A landmark moment for someone — or something — special.',
    date: true,
    time: true,
    guests: true,
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
  guests: true,
  age: false,
  gender: false,
  sections: [],
};

export const templateFor = (celebId: string): CelebTemplate =>
  CELEB_TEMPLATES[celebId] ?? DEFAULT_TEMPLATE;
