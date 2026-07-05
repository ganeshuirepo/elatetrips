import type { PartnerType } from '@/store/elateApi';

/**
 * Template-driven onboarding forms — one template per partner track, derived
 * from the ElateTrips partner-onboarding playbooks (Hotels, Transport,
 * On-Ground Services, Adventure & Wellness, Local Guides, Gifting).
 *
 * A template is pure data: the generic `VendorForm` renders whatever sections
 * and fields it declares, so adding a vendor type (or a field) means editing
 * this file only.
 */

export type FieldType = 'text' | 'email' | 'tel' | 'number' | 'select' | 'radio' | 'chips' | 'textarea';

export interface FieldDef {
  /** Unique key within the template; becomes the key in the `details` payload. */
  key: string;
  label: string;
  type: FieldType;
  /** Choices for select / radio / chips fields. */
  options?: string[];
  required?: boolean;
  placeholder?: string;
  hint?: string;
  /** Stack radio chips vertically (for long labels). */
  column?: boolean;
  /** Render read-only (e.g. launch city). */
  readOnly?: boolean;
}

export interface SectionDef {
  key: string;
  title: string;
  hint: string;
  fields: FieldDef[];
}

/** What a portfolio entry means for this vendor type (package, vehicle, SKU…). */
export interface PortfolioConfig {
  title: string;
  hint: string;
  /** Noun for the "Add …" button, e.g. "celebration package". */
  itemNoun: string;
  nameLabel: string;
  namePlaceholder: string;
  descLabel: string;
  descPlaceholder: string;
  priceLabel: string;
  pricePlaceholder: string;
  linkLabel: string;
}

export interface VendorTemplate {
  type: PartnerType;
  /** URL segment under /partner/, e.g. "hotels". */
  slug: string;
  label: string;
  icon: string;
  /** One-liner shown on the chooser card (from the deck cover). */
  tagline: string;
  heroTitle: string;
  heroBody: string;
  /** Section 1 — business & contact. Uses the conventional business keys. */
  business: SectionDef;
  /** Track-specific capability sections. */
  sections: SectionDef[];
  /** "Documents you have ready" multi-pick, from the readiness checklist. */
  documents: { hint: string; options: string[] };
  portfolio: PortfolioConfig;
}

const YES_NO = ['Yes', 'No'];

/** Shared contact fields; `nameLabel` varies per track (property, fleet, self…). */
const contactFields = (nameLabel: string, namePlaceholder: string, solo = false): FieldDef[] => [
  { key: 'businessName', label: nameLabel, type: 'text', required: true, placeholder: namePlaceholder },
  {
    key: 'city',
    label: 'City / destination',
    type: 'text',
    readOnly: true,
    hint: 'Currently launching in Ooty.',
  },
  ...(solo
    ? []
    : ([
        { key: 'contactName', label: 'Contact person', type: 'text', required: true },
        { key: 'role', label: 'Role / designation', type: 'text', placeholder: 'e.g. Owner, Manager' },
      ] as FieldDef[])),
  { key: 'email', label: 'Email', type: 'email', required: true },
  { key: 'phone', label: 'Phone / WhatsApp', type: 'tel', required: true, placeholder: '+91…' },
];

/* ------------------------------------------------------------------ */
/* 01 · Hotels & Curated Stays                                         */
/* ------------------------------------------------------------------ */

const hotels: VendorTemplate = {
  type: 'hotel',
  slug: 'hotels',
  label: 'Hotels & Curated Stays',
  icon: 'ti-bed',
  tagline: 'Turn rooms into celebrations — and celebrations into your highest-value bookings.',
  heroTitle: 'Your property isn’t a listing. It’s the venue.',
  heroBody:
    'Customers pick an occasion — a birthday, anniversary, honeymoon or wedding — and we recommend handpicked properties where the celebration can actually happen. Stay + cake + décor + photoshoot: one checkout, multiple revenue lines for your property.',
  business: {
    key: 'business',
    title: 'Property & contact',
    hint: 'Basic details so our partnerships team can reach you.',
    fields: [
      ...contactFields('Hotel / property name', 'e.g. Misty Pines Resort'),
      {
        key: 'category',
        label: 'Property category',
        type: 'select',
        options: ['3-star', '4-star', '5-star / luxury', 'Spacious Resort/Villa/homestay'],
      },
      { key: 'totalRooms', label: 'Total number of rooms', type: 'number', placeholder: 'e.g. 48' },
    ],
  },
  sections: [
    {
      key: 'property',
      title: 'Spaces & celebration readiness',
      hint: 'What raises your ranking: private spaces, F&B that can produce cakes and candlelight dinners, suite inventory and photoshoot-friendly corners.',
      fields: [
        {
          key: 'privateSpaces',
          label: 'Banquet, lawn or rooftop space for private moments',
          type: 'radio',
          options: ['Banquet hall', 'Lawn / garden', 'Rooftop', 'More than one', 'None'],
        },
        {
          key: 'inHouseFnb',
          label: 'In-house F&B',
          type: 'radio',
          options: ['Full kitchen — cakes & candlelight dinners', 'Limited / breakfast only', 'No in-house F&B'],
        },
        { key: 'suiteInventory', label: 'Suite or honeymoon inventory — tubs, views, private balconies', type: 'radio', options: YES_NO },
        { key: 'photoshootSpaces', label: 'Photoshoot-friendly spaces and lighting', type: 'radio', options: YES_NO },
        {
          key: 'policies',
          label: 'Celebration-friendly policies (tick all that apply)',
          type: 'chips',
          options: [
            'Outside cake allowed',
            'Room décor allowed',
            'Flexible late checkout',
            'Private dining setups',
            'Hosted proposals / anniversaries before',
          ],
        },
        {
          key: 'guestRating',
          label: 'Guest rating on major platforms',
          type: 'select',
          options: ['4.5+', '4.0 – 4.4', '3.5 – 3.9', 'Below 3.5', 'Not listed yet'],
        },
      ],
    },
    {
      key: 'surprise',
      title: 'Surprise & setup capability',
      hint: 'Many bookings are surprises (birthdays, proposals). We need to know what your team can quietly execute.',
      fields: [
        {
          key: 'surpriseCapable',
          label: 'Can your team execute a surprise in-room setup before the guest arrives, kept hidden from the co-traveller?',
          type: 'radio',
          required: true,
          options: ['Yes, routinely', 'Sometimes / with notice', 'No'],
        },
        {
          key: 'setupWindow',
          label: 'Typical setup window you need before check-in',
          type: 'select',
          options: ['Under 1 hour', '1–2 hours', '2–4 hours', 'Same day, flexible', 'Day before'],
        },
        { key: 'photoProof', label: 'Can you share photo proof on setup completion?', type: 'select', options: YES_NO },
        {
          key: 'namedContact',
          label: 'A named contact empowered to confirm bookings fast',
          type: 'radio',
          options: ['Yes, one person', 'A small desk / team', 'Not yet'],
        },
      ],
    },
    {
      key: 'inventory',
      title: 'Room fares & availability — keeping it real-time',
      hint: 'Tell us how you’d keep rates and availability current so guests never see stale prices or overbook. Our confirmation SLA is 2 hours (8 am – 10 pm).',
      fields: [
        {
          key: 'updateMethod',
          label: 'Preferred way to update fares & availability',
          type: 'radio',
          required: true,
          column: true,
          options: [
            'Connect my channel manager (real-time, automatic)',
            'PMS / API integration (real-time, automatic)',
            'Self-serve extranet portal (I update manually)',
            'Bulk CSV / Excel upload',
            'Share with ElateTrips ops (email/WhatsApp), they update',
          ],
        },
        { key: 'channelManagerOrPMS', label: 'Channel manager / PMS you use (if any)', type: 'text', placeholder: 'e.g. STAAH, SiteMinder, eZee, Cloudbeds' },
        {
          key: 'updateFrequency',
          label: 'How often can you refresh rates & availability?',
          type: 'select',
          options: ['Real-time / automatic', 'Multiple times a day', 'Once a day', 'Weekly', 'On request only'],
        },
        { key: 'liveAvailability', label: 'Can you provide live availability (no manual reconfirm)?', type: 'select', options: ['Yes', 'Partial', 'No, request-to-confirm'] },
        { key: 'roomsAllocated', label: 'Rooms you’d allocate to ElateTrips', type: 'number', placeholder: 'e.g. 10' },
        { key: 'rateModel', label: 'Rate model', type: 'select', options: ['Dynamic per-night (changes with demand)', 'Fixed contracted rate', 'Seasonal tiers'] },
        { key: 'confirmationSLA', label: 'Confirmation turnaround (request bookings)', type: 'select', options: ['Within 30 minutes', 'Within 2 hours', 'Within 4 hours', 'Same day'] },
      ],
    },
  ],
  documents: {
    hint: 'Everything uploads through the partner app in minutes — originals never leave your premises.',
    options: [
      'Business registration / PAN',
      'GST registration',
      'Bank details + cancelled cheque',
      'Owner KYC — PAN / Aadhaar',
      'Property / tourism registration & fire safety NOC',
      'High-resolution photos — 10+ per room type',
      'Rate card incl. seasonal & blackout dates',
      'FSSAI licence (in-house F&B)',
    ],
  },
  portfolio: {
    title: 'Your celebration packages',
    hint: 'What customers will see: 2–3 packages per occasion with cake, décor and dinner tiers. Add what you already run — we’ll merchandise it together.',
    itemNoun: 'package',
    nameLabel: 'Package name',
    namePlaceholder: 'e.g. Birthday Suite Décor — Signature',
    descLabel: 'Inclusions & setup time',
    descPlaceholder: 'Cake, balloon arch, candlelight dinner for two, 45-min setup…',
    priceLabel: 'Price range',
    pricePlaceholder: 'e.g. ₹4,000 – ₹12,000',
    linkLabel: 'Photos link (Drive / Instagram)',
  },
};

/* ------------------------------------------------------------------ */
/* 02 · Transport & Cab Partners                                       */
/* ------------------------------------------------------------------ */

const transport: VendorTemplate = {
  type: 'transport',
  slug: 'transport',
  label: 'Transport & Cab Partners',
  icon: 'ti-car',
  tagline: 'Be the first hello and the last goodbye of every celebration trip.',
  heroTitle: 'Prepaid duties, exact GPS pickups, no idle hours',
  heroBody:
    'Customers book the whole trip at once, so you get confirmed, prepaid duties tied to a full itinerary — transfers, sightseeing days and outstation legs together. Our smart pickup means your drivers get exact locations, never guessed addresses.',
  business: {
    key: 'business',
    title: 'Business & contact',
    hint: 'Basic details so our partnerships team can reach you.',
    fields: contactFields('Business / fleet name', 'e.g. Nilgiri Cabs'),
  },
  sections: [
    {
      key: 'fleet',
      title: 'Your fleet',
      hint: 'A mixed fleet of well-maintained sedans and SUVs is the baseline; premium, décor-ready and EV options raise your ranking.',
      fields: [
        { key: 'fleetSize', label: 'Number of vehicles', type: 'number', placeholder: 'e.g. 12' },
        {
          key: 'vehicleClasses',
          label: 'Vehicle classes you run (tick all that apply)',
          type: 'chips',
          required: true,
          options: ['Hatchback', 'Sedan', 'SUV / MUV', 'Premium / luxury', 'Tempo traveller / minibus', 'EV'],
        },
        { key: 'decorReady', label: 'Premium / décor-ready vehicles for weddings & proposals', type: 'radio', options: YES_NO },
        { key: 'driversCount', label: 'Number of drivers', type: 'number', placeholder: 'e.g. 15' },
        {
          key: 'smartphoneDrivers',
          label: 'Smartphone-equipped drivers comfortable with app duties',
          type: 'radio',
          options: ['All drivers', 'Most drivers', 'Some drivers'],
        },
        { key: 'multilingualDrivers', label: 'Courteous, multilingual drivers', type: 'radio', options: ['Yes', 'Some', 'Local language only'] },
      ],
    },
    {
      key: 'coverage',
      title: 'Coverage & dispatch',
      hint: 'Our SLA: driver & vehicle assigned 12 hours before every pickup, ≥95% on-time arrivals.',
      fields: [
        { key: 'serviceArea', label: 'Service area / routes covered', type: 'text', placeholder: 'e.g. Ooty–Coonoor, Coimbatore airport transfers' },
        { key: 'hillRoutes', label: 'Outstation and hill-route experience', type: 'radio', options: YES_NO },
        { key: 'nightDriving', label: 'Night-driving coverage', type: 'radio', options: YES_NO },
        {
          key: 'dispatch',
          label: 'How is dispatch handled?',
          type: 'radio',
          options: ['24×7 dispatch desk', 'Fixed-hours dispatch desk', 'Owner-managed'],
        },
        {
          key: 'rateCards',
          label: 'Rate cards you can share (tick all that apply)',
          type: 'chips',
          options: ['Airport / point transfers', 'Hourly rental', 'Outstation per-km', 'Multi-day packages'],
        },
        {
          key: 'assignmentWindow',
          label: 'How early can you assign driver & vehicle?',
          type: 'select',
          options: ['12+ hours before pickup', '6–12 hours before', 'Under 6 hours'],
        },
      ],
    },
    {
      key: 'compliance',
      title: 'Compliance & verification',
      hint: 'Traveller safety is non-negotiable: permits and insurance on every vehicle, verified drivers.',
      fields: [
        {
          key: 'permitsInsurance',
          label: 'Commercial permits and valid insurance on every vehicle',
          type: 'radio',
          required: true,
          options: ['Yes, on every vehicle', 'On most — completing the rest', 'Not yet'],
        },
        {
          key: 'driverVerification',
          label: 'Driver verification — licence, police verification, references',
          type: 'radio',
          required: true,
          options: ['All drivers verified', 'In progress', 'Not yet'],
        },
      ],
    },
  ],
  documents: {
    hint: 'Everything uploads through the partner app in minutes — originals never leave your premises.',
    options: [
      'Business registration / PAN',
      'GST registration',
      'Bank details + cancelled cheque',
      'Owner KYC — PAN / Aadhaar',
      'Vehicle RCs, permits & fitness certificates',
      'Insurance policy per vehicle',
      'Driver licences + police verification',
      'Fleet list — model, year, seating',
    ],
  },
  portfolio: {
    title: 'Your vehicle classes',
    hint: 'What customers will see: vehicle classes with photos, seating and luggage capacity, plus transfer / hourly / outstation rates.',
    itemNoun: 'vehicle class',
    nameLabel: 'Vehicle / class',
    namePlaceholder: 'e.g. Innova Crysta — 6+1',
    descLabel: 'Seating, luggage & features',
    descPlaceholder: '6 passengers + luggage, carrier, décor-ready, chilled water…',
    priceLabel: 'Indicative rate',
    pricePlaceholder: 'e.g. ₹18/km · ₹3,500/day',
    linkLabel: 'Photos link (Drive / Instagram)',
  },
};

/* ------------------------------------------------------------------ */
/* 03 · On-Ground Services — Décor, Events & Photography               */
/* ------------------------------------------------------------------ */

const onground: VendorTemplate = {
  type: 'onground',
  slug: 'on-ground',
  label: 'On-Ground Services',
  icon: 'ti-balloon',
  tagline: 'You’re the wow. We bring you the room, the date and the reason.',
  heroTitle: 'Pre-scoped orders. You focus on the craft.',
  heroBody:
    'Décor, cakes, photography and event setups are the heart of what ElateTrips sells. We scope every order before it reaches you: venue confirmed with the hotel, date and time locked, occasion and preferences captured. Your crew arrives, sets up, and delivers the wow.',
  business: {
    key: 'business',
    title: 'Business & contact',
    hint: 'Basic details so our partnerships team can reach you.',
    fields: contactFields('Business / studio name', 'e.g. Bloom & Beam Events'),
  },
  sections: [
    {
      key: 'craft',
      title: 'Your craft',
      hint: 'A portfolio of 10+ real, recent events with photos is the baseline; décor + photography combo capability raises your ranking.',
      fields: [
        {
          key: 'services',
          label: 'What do you offer? (tick all that apply)',
          type: 'chips',
          required: true,
          options: ['Décor & styling', 'Cakes & desserts', 'Photography / videography', 'Event setups', 'Live music', 'Makeup artist'],
        },
        {
          key: 'eventsDelivered',
          label: 'Real, recent events delivered (with photos to show)',
          type: 'select',
          options: ['10 – 25', '25 – 50', '50 – 100', '100+'],
        },
        {
          key: 'crew',
          label: 'Equipment & crew',
          type: 'radio',
          options: ['Own equipment & trained setup crew', 'Partly rented / freelance crew', 'Building the crew now'],
        },
        { key: 'crewSize', label: 'Typical crew size on an order', type: 'number', placeholder: 'e.g. 4' },
        { key: 'hotelExperience', label: 'Comfortable working inside hotel properties', type: 'radio', options: YES_NO },
        {
          key: 'themeLibrary',
          label: 'Occasions you keep a theme library for',
          type: 'chips',
          options: ['Birthdays', 'Proposals', 'Anniversaries', 'Honeymoon', 'Baby showers', 'Intimate weddings'],
        },
      ],
    },
    {
      key: 'responsiveness',
      title: 'Responsiveness & coverage',
      hint: 'Our SLAs: quote or confirmation within 4 hours; setup complete 60 minutes before the moment begins.',
      fields: [
        {
          key: 'quoteTurnaround',
          label: 'Quote / confirmation turnaround on a new order',
          type: 'select',
          required: true,
          options: ['Within 1 hour', 'Within 4 hours', 'Same day', 'Next day'],
        },
        {
          key: 'shortNotice',
          label: 'Shortest notice you can deliver a full setup',
          type: 'radio',
          options: ['Same day', '24 hours', '48 hours or more'],
        },
        { key: 'coverageArea', label: 'Destinations you cover', type: 'text', placeholder: 'e.g. Ooty, Coonoor, Kotagiri' },
        { key: 'travelCharges', label: 'Travel charges stated upfront', type: 'radio', options: YES_NO },
      ],
    },
  ],
  documents: {
    hint: 'Everything uploads through the partner app in minutes — originals never leave your premises.',
    options: [
      'Business registration / PAN',
      'GST registration',
      'Bank details + cancelled cheque',
      'Owner KYC — PAN / Aadhaar',
      'Event portfolio — photos or links',
      'Equipment & crew roster',
      'Sample package sheets with inclusions',
      'Liability insurance (recommended)',
    ],
  },
  portfolio: {
    title: 'Your occasion packages',
    hint: 'What customers will see: three tiers per occasion — Essential, Signature, Luxe — with clear inclusions, photos and setup times.',
    itemNoun: 'package',
    nameLabel: 'Package name',
    namePlaceholder: 'e.g. Proposal Décor — Luxe',
    descLabel: 'Inclusions & setup time',
    descPlaceholder: 'Floral arch, 200 candles, photographer for 1 hr, 90-min setup…',
    priceLabel: 'Price range',
    pricePlaceholder: 'e.g. ₹6,000 – ₹25,000',
    linkLabel: 'Portfolio link (Drive / Instagram)',
  },
};

/* ------------------------------------------------------------------ */
/* 04 · Adventure & Wellness Centers                                   */
/* ------------------------------------------------------------------ */

const adventure: VendorTemplate = {
  type: 'adventure',
  slug: 'adventure-wellness',
  label: 'Adventure & Wellness',
  icon: 'ti-mountain',
  tagline: 'Give every celebration its adrenaline — or its deep breath.',
  heroTitle: 'Occasion-matched demand, pre-booked and prepaid',
  heroBody:
    'Honeymooners add couple spa rituals; birthday groups add treks, rafting and paragliding. ElateTrips matches your sessions to the occasion and the traveller profile — group size, ages and fitness notes arrive with every booking.',
  business: {
    key: 'business',
    title: 'Business & contact',
    hint: 'Basic details so our partnerships team can reach you.',
    fields: contactFields('Center / operator name', 'e.g. Blue Hills Adventures'),
  },
  sections: [
    {
      key: 'offering',
      title: 'Your offering',
      hint: 'Private couple formats, small-group sessions and hotel pickup raise your ranking.',
      fields: [
        {
          key: 'centerType',
          label: 'What kind of center are you?',
          type: 'radio',
          required: true,
          options: ['Adventure activities', 'Wellness & spa', 'Both'],
        },
        {
          key: 'formats',
          label: 'Formats you offer (tick all that apply)',
          type: 'chips',
          options: ['Private couple', 'Small group', 'Large group', 'Hotel pickup available', 'Wellness + adventure combo days'],
        },
        {
          key: 'scheduling',
          label: 'How do you schedule sessions?',
          type: 'radio',
          options: ['Fixed session calendar with honest capacity', 'On-request slots'],
        },
        {
          key: 'weatherPolicy',
          label: 'Seasonal availability & weather policy',
          type: 'textarea',
          placeholder: 'e.g. Paragliding Oct–May, mornings only; full refund or reschedule on weather cancellation…',
        },
      ],
    },
    {
      key: 'safety',
      title: 'Safety & credentials',
      hint: 'Certified staff present at every session — no unsupervised sessions, ever. A safety briefing before every single session.',
      fields: [
        {
          key: 'certifications',
          label: 'Certified instructors / therapists with current credentials',
          type: 'radio',
          required: true,
          options: ['All certified, credentials current', 'Partially certified', 'Working towards it'],
        },
        {
          key: 'insuranceSops',
          label: 'Liability insurance and documented safety SOPs',
          type: 'radio',
          options: ['Both in place', 'Insurance only', 'SOPs only', 'Neither yet'],
        },
        {
          key: 'equipment',
          label: 'Equipment condition',
          type: 'radio',
          options: ['Audited with maintenance log', 'Well-maintained, no formal log', 'Needs investment'],
        },
        { key: 'guardrails', label: 'Clear age, health and fitness guardrails per activity', type: 'radio', options: YES_NO },
        {
          key: 'slotConfirmation',
          label: 'Slot confirmation on a new booking',
          type: 'select',
          options: ['Within 30 minutes', 'Within 2 hours', 'Same day'],
          hint: 'Our SLA: within 2 hours.',
        },
        { key: 'sessionCapture', label: 'Photo & video capture of sessions', type: 'radio', options: ['Yes', 'On request', 'No'] },
      ],
    },
  ],
  documents: {
    hint: 'Everything uploads through the partner app in minutes — originals never leave your premises.',
    options: [
      'Business registration / PAN',
      'GST registration',
      'Bank details + cancelled cheque',
      'Owner KYC — PAN / Aadhaar',
      'Operator licence (where applicable)',
      'Instructor / therapist certifications',
      'Insurance policy & safety SOPs',
      'Equipment audit / maintenance log',
    ],
  },
  portfolio: {
    title: 'Your sessions & activities',
    hint: 'What customers will see: sessions with duration, difficulty, age limits and inclusions — couple, group and private formats.',
    itemNoun: 'session',
    nameLabel: 'Session / activity',
    namePlaceholder: 'e.g. Sunrise Paragliding — Tandem',
    descLabel: 'Duration, difficulty, age limits & inclusions',
    descPlaceholder: '20-min flight, beginner-friendly, ages 14–60, GoPro footage included…',
    priceLabel: 'Price per person',
    pricePlaceholder: 'e.g. ₹2,800 – ₹4,500',
    linkLabel: 'Photos / video link',
  },
};

/* ------------------------------------------------------------------ */
/* 05 · Local Guides                                                   */
/* ------------------------------------------------------------------ */

const guides: VendorTemplate = {
  type: 'guide',
  slug: 'local-guides',
  label: 'Local Guides',
  icon: 'ti-compass',
  tagline: 'You know the ground truth. Hosts, storytellers and surprise coordinators.',
  heroTitle: 'Guests want your town the way you know it',
  heroBody:
    'ElateTrips guides host food trails, heritage walks and celebration moments — and quietly coordinate surprises with the hotel and vendors. You bring the local knowledge; bookings, payments and day plans arrive in the app.',
  business: {
    key: 'business',
    title: 'About you',
    hint: 'You’re signing up as yourself — no company required.',
    fields: contactFields('Your full name', 'e.g. R. Karthik', true),
  },
  sections: [
    {
      key: 'profile',
      title: 'Local knowledge & availability',
      hint: 'Local residency and honest availability windows are the baseline; niche expertise raises your ranking.',
      fields: [
        {
          key: 'languages',
          label: 'Languages you host in (tick all that apply)',
          type: 'chips',
          required: true,
          options: ['Tamil', 'English', 'Hindi', 'Malayalam', 'Kannada', 'Telugu', 'Other'],
        },
        { key: 'areasCovered', label: 'Areas you cover', type: 'text', required: true, placeholder: 'e.g. Ooty town, Coonoor, Avalanche, Emerald' },
        {
          key: 'residency',
          label: 'How long have you lived here?',
          type: 'select',
          options: ['Born & raised here', '10+ years', '3 – 10 years', 'Under 3 years'],
        },
        {
          key: 'smartphone',
          label: 'Smartphone confidence — chat, maps, in-app updates',
          type: 'radio',
          options: ['Very comfortable', 'Comfortable', 'Still learning'],
        },
        {
          key: 'availability',
          label: 'Availability (tick all that apply)',
          type: 'chips',
          options: ['Weekdays', 'Weekends', 'Full-time', 'Peak season only'],
        },
      ],
    },
    {
      key: 'specialities',
      title: 'Specialities & background',
      hint: 'Storytelling, photography skills and event-coordination instincts for surprises make guests remember you.',
      fields: [
        {
          key: 'specialities',
          label: 'Your niches (tick all that apply)',
          type: 'chips',
          options: ['Food trails', 'Heritage & history', 'Treks & nature', 'Photography', 'Local markets & shopping', 'Spiritual & temples', 'Surprise coordination'],
        },
        {
          key: 'background',
          label: 'Storytelling, hospitality or tour-leading background',
          type: 'textarea',
          placeholder: 'e.g. 4 years leading tea-estate walks; hosted 20+ birthday surprises…',
        },
        { key: 'guideLicence', label: 'Tourism guide licence', type: 'radio', options: ['Yes', 'Applied', 'No'] },
        {
          key: 'introVideo',
          label: 'Intro video link (60–90 seconds)',
          type: 'text',
          placeholder: 'YouTube / Drive link',
          hint: 'A phone-shot hello is perfect — it becomes your profile video.',
        },
      ],
    },
    {
      key: 'verification',
      title: 'Verification',
      hint: 'Background verification is non-negotiable for guest safety.',
      fields: [
        {
          key: 'policeVerification',
          label: 'Police verification certificate',
          type: 'radio',
          required: true,
          options: ['Certificate in hand', 'Willing to obtain', 'Not yet'],
        },
        { key: 'references', label: 'Two references available', type: 'radio', options: YES_NO },
      ],
    },
  ],
  documents: {
    hint: 'Everything uploads through the partner app in minutes — originals never leave your hands.',
    options: [
      'PAN & government ID',
      'Bank details',
      'Police verification certificate',
      'Address proof — local residency',
      'Guide licence (where applicable)',
      'Two references',
      'Language self-declaration',
      'Availability declaration',
    ],
  },
  portfolio: {
    title: 'Signature local experiences',
    hint: 'What customers will see: experiences only a local can host — food walks, hidden viewpoints, festival evenings.',
    itemNoun: 'experience',
    nameLabel: 'Experience name',
    namePlaceholder: 'e.g. Ooty Bazaar Food Walk',
    descLabel: 'What happens, duration & group size',
    descPlaceholder: '2-hr evening walk, 6 tastings, up to 8 guests…',
    priceLabel: 'Price per group / person',
    pricePlaceholder: 'e.g. ₹1,500 per group',
    linkLabel: 'Photos / video link',
  },
};

/* ------------------------------------------------------------------ */
/* 06 · Gifting & Surprise Store Vendors                               */
/* ------------------------------------------------------------------ */

const gifting: VendorTemplate = {
  type: 'gifting',
  slug: 'gifting',
  label: 'Gifting & Surprise Store',
  icon: 'ti-gift',
  tagline: 'Gifts that arrive gift-ready — cakes, hampers and local originals.',
  heroTitle: 'Your shelf, inside every celebration checkout',
  heroBody:
    'Cakes, flowers, hampers and local specialities sell inside the trip — tagged to birthdays, anniversaries and honeymoons. Orders arrive prepaid with delivery details; you make, pack and deliver gift-ready.',
  business: {
    key: 'business',
    title: 'Store & contact',
    hint: 'Basic details so our partnerships team can reach you.',
    fields: contactFields('Store / brand name', 'e.g. Ooty Made Better'),
  },
  sections: [
    {
      key: 'products',
      title: 'Products & provenance',
      hint: 'Genuinely local products with provenance you can show; exclusive specialities not sold on generic platforms raise your ranking.',
      fields: [
        {
          key: 'categories',
          label: 'What do you sell? (tick all that apply)',
          type: 'chips',
          required: true,
          options: ['Cakes & desserts', 'Flowers & bouquets', 'Gift hampers', 'Local specialities', 'Handicrafts', 'Personalised gifts'],
        },
        {
          key: 'provenance',
          label: 'Genuinely local products or sourcing',
          type: 'radio',
          options: ['Made by us, locally', 'Locally sourced', 'Mixed local + outside'],
        },
        {
          key: 'fssai',
          label: 'FSSAI licence for edible products',
          type: 'radio',
          required: true,
          options: ['Yes', 'Applied / in progress', 'Not applicable — nothing edible'],
        },
        {
          key: 'personalisation',
          label: 'Personalisation you offer (tick all that apply)',
          type: 'chips',
          options: ['Handwritten notes', 'Engraving', 'Custom hampers', 'Photo gifts', 'None'],
        },
        {
          key: 'personalisationLeadTime',
          label: 'Lead time for personalised items',
          type: 'select',
          options: ['Same day', '24 hours', '2–3 days'],
        },
        { key: 'ecoPackaging', label: 'Eco-friendly packaging', type: 'radio', options: ['Yes', 'Partly', 'Not yet'] },
      ],
    },
    {
      key: 'fulfilment',
      title: 'Fulfilment',
      hint: 'Our SLAs: order acceptance within 1 hour during store hours; ≥98% on-time delivery to hotels and venues; 100% freshness on perishables.',
      fields: [
        { key: 'sameDay', label: 'Same-day fulfilment within your destination', type: 'radio', required: true, options: YES_NO },
        { key: 'deliveryZones', label: 'Delivery zones', type: 'text', placeholder: 'e.g. Ooty town + 15 km' },
        { key: 'sameDayCutoff', label: 'Same-day order cut-off time', type: 'select', options: ['12 pm', '3 pm', '6 pm', 'Depends on the item'] },
        { key: 'hotelDelivery', label: 'Experience delivering to hotels', type: 'radio', options: YES_NO },
        {
          key: 'acceptanceTime',
          label: 'Order acceptance during store hours',
          type: 'select',
          options: ['Within 15 minutes', 'Within 1 hour', 'Within store hours'],
        },
        { key: 'stock', label: 'Stock consistency', type: 'radio', options: ['Always in stock', 'Mostly consistent', 'Seasonal items vary'] },
      ],
    },
  ],
  documents: {
    hint: 'Everything uploads through the partner app in minutes — originals never leave your premises.',
    options: [
      'Business registration / PAN',
      'GST registration',
      'Bank details + cancelled cheque',
      'Owner KYC — PAN / Aadhaar',
      'FSSAI licence for edible products',
      'SKU catalogue — photos & shelf life',
      'Sourcing / provenance declaration',
      'Packaging & delivery specs',
    ],
  },
  portfolio: {
    title: 'Your bestsellers',
    hint: 'What customers will see: SKUs with photos, honest shelf life, occasion tags and same-day cut-offs.',
    itemNoun: 'product',
    nameLabel: 'Product name',
    namePlaceholder: 'e.g. Homemade Chocolate & Eucalyptus Hamper',
    descLabel: 'Description, shelf life & occasion fit',
    descPlaceholder: '12 assorted chocolates + oil + candle; 3-week shelf life; anniversaries…',
    priceLabel: 'Price',
    pricePlaceholder: 'e.g. ₹1,200',
    linkLabel: 'Photo link (Drive / Instagram)',
  },
};

/** All templates in display order. */
export const VENDOR_TEMPLATES: VendorTemplate[] = [hotels, transport, onground, adventure, guides, gifting];

export const templateBySlug = (slug: string): VendorTemplate | undefined =>
  VENDOR_TEMPLATES.find((t) => t.slug === slug);

export const templateByType = (type: PartnerType): VendorTemplate | undefined =>
  VENDOR_TEMPLATES.find((t) => t.type === type);
