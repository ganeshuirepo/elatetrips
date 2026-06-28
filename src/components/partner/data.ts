/** Static option catalogue for the hotelier EOI form. */

export interface ServiceDef {
  key: string;
  label: string;
  icon: string;
  /** Sub-options the partner can tick (decor packages, on-ground roles, …). */
  optionsLabel?: string;
  packages?: string[];
}

/** Celebration services a property can express interest in offering. */
export const SERVICES: ServiceDef[] = [
  {
    key: 'celebration_packages',
    label: 'Celebration packages (room decor / setup)',
    icon: 'ti-confetti',
    optionsLabel: 'Which celebration packages can you offer? (tick all that apply)',
    packages: ['Surprise welcome', 'Private dinner', 'Outdoor decor', 'Private music', 'Special wish dish'],
  },
  { key: 'cab', label: 'Cab / transport', icon: 'ti-car' },
  {
    key: 'onground_services',
    label: 'On-ground services (photographer, makeup, planner, guide)',
    icon: 'ti-camera',
    optionsLabel: 'Which of these can you offer? (tick all that apply)',
    packages: ['Photographer', 'Makeup artist', 'Event planner', 'Local guide'],
  },
  { key: 'gifts', label: 'Gifts (cakes, flowers, hampers)', icon: 'ti-gift' },
  { key: 'medical_kit', label: 'Medical kits', icon: 'ti-first-aid-kit' },
];

export const FULFILMENT = [
  'In-house team',
  'My own partner / vendor',
  'Need ElateTrips to source',
  'Not offered',
];

export const LEADTIME = ['Under 24 hours', '1–2 days', '3–5 days', 'More than 5 days'];

export const CATEGORIES = ['3-star', '4-star', '5-star / luxury', 'Spacious Resort/Villa/homestay'];

export const SETUP_WINDOWS = [
  'Under 1 hour',
  '1–2 hours',
  '2–4 hours',
  'Same day, flexible',
  'Day before',
];

export const YES_NO = ['Yes', 'No'];

/** Surprise in-room setup capability (radio chips). */
export const SURPRISE_CAPABLE = ['Yes, routinely', 'Sometimes / with notice', 'No'];

/** How the property keeps fares & availability current (radio chips). */
export const UPDATE_METHODS: { value: string; label: string }[] = [
  { value: 'Channel manager', label: 'Connect my channel manager (real-time, automatic)' },
  { value: 'PMS / API integration', label: 'PMS / API integration (real-time, automatic)' },
  { value: 'Self-serve extranet', label: 'Self-serve extranet portal (I update manually)' },
  { value: 'Bulk CSV / Excel upload', label: 'Bulk CSV / Excel upload' },
  { value: 'Share with ops (email/WhatsApp)', label: 'Share with ElateTrips ops (email/WhatsApp), they update' },
];

export const UPDATE_FREQ = [
  'Real-time / automatic',
  'Multiple times a day',
  'Once a day',
  'Weekly',
  'On request only',
];

export const LIVE_AVAILABILITY = ['Yes', 'Partial', 'No, request-to-confirm'];

export const RATE_MODELS = [
  'Dynamic per-night (changes with demand)',
  'Fixed contracted rate',
  'Seasonal tiers',
];

export const CONFIRM_SLA = ['Within 30 minutes', 'Within 2 hours', 'Within 4 hours', 'Same day'];
