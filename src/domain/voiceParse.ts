import { CELEBRATIONS } from '@/data/celebrations';
import { DESTINATIONS } from '@/data/destinations';
import { SHARED_CATEGORIES, SPECIAL_CATEGORIES, SURPRISE_GIFTS } from '@/data/services';

/**
 * Local (no-API) natural-language parser for the voice assistant. It scans a
 * transcript for the app's known vocabulary — occasions, the live destination,
 * head/room counts, venue, time and service keywords — and returns whatever it
 * confidently detected. Designed as a swappable seam: an LLM extractor could
 * replace this function and keep the same result shape.
 */
export interface VoiceParseResult {
  destination?: { id: string; name: string };
  celebrations: string[];
  /** Tour date range (ISO), e.g. "24 to 28 December". */
  dates?: { start: string; end: string };
  adults?: number;
  children?: number;
  rooms?: number;
  venue?: string;
  time?: string;
  ageGroup?: string;
  gender?: string;
  milestoneFor?: string;
  transport?: 'own' | 'cab';
  /** Cab trip type — "complete trip" vs "local trips". */
  tripType?: 'local' | 'endtoend';
  /** Vehicle id from the fleet (sedan, suv, tempo…). */
  vehicle?: string;
  /** Coupon code, e.g. DEALNOW. */
  coupon?: string;
  /** category id → detected option ids. */
  services: Record<string, string[]>;
}

const NUM_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, couple: 2,
};

const toNum = (w: string): number | null =>
  /^\d+$/.test(w) ? Number(w) : (NUM_WORDS[w] ?? null);

/**
 * Find "<number> <unit>" and return the number. Scans all matches and prefers a
 * real count (digit or number-word) over the article "a/an" — so "a kids party …
 * 10 kids" yields 10, not 1.
 */
function countBefore(text: string, units: string[]): number | undefined {
  const re = new RegExp(`(\\d+|[a-z]+)\\s+(?:${units.join('|')})\\b`, 'gi');
  const cands: { tok: string; n: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tok = m[1].toLowerCase();
    const n = toNum(tok);
    if (n != null) cands.push({ tok, n });
  }
  if (cands.length === 0) return undefined;
  const strong = cands.find((c) => /^\d+$/.test(c.tok) || (c.tok !== 'a' && c.tok !== 'an'));
  return (strong ?? cands[0]).n;
}

/** Occasion synonyms (fallback is the celebration's own name). */
const CELEB_SYNONYMS: Record<string, string[]> = {
  birthday: ['birthday', 'bday', 'b-day'],
  bachelor: ['bachelor', 'bachelorette', 'stag', 'hen party'],
  teamouting: ['proposal', 'propose', 'engagement'],
  honeymoon: ['honeymoon'],
  anniversary: ['anniversary'],
};

/** Service-option synonyms (fallback is the option label + id). */
const SERVICE_SYNONYMS: Record<string, string[]> = {
  balloons: ['balloon', 'balloons', 'theme decor'],
  flowers: ['floral', 'flowers'],
  stage: ['stage', 'backdrop'],
  lighting: ['lighting', 'lights', 'fairy lights'],
  table: ['table styling', 'table setup'],
  photographer: ['photographer', 'photography', 'photos'],
  videographer: ['videographer', 'videography', 'cinematographer'],
  makeup: ['makeup', 'make up', 'makeup artist'],
  host: ['host', 'anchor', 'emcee'],
  security: ['security', 'bouncer'],
  cake: ['cake'],
  buffet: ['buffet'],
  plated: ['plated', 'sit down dinner'],
  live: ['live counter', 'live counters', 'live cooking'],
  bar: ['bar', 'cocktail', 'mocktail'],
  dj: ['dj', 'disc jockey'],
  liveband: ['live band', 'band'],
  guitarist: ['guitarist', 'acoustic guitar', 'guitar'],
  magician: ['magician', 'magic show'],
  entry: ['welcome entry', 'grand entry', 'grand welcome'],
  drinks: ['welcome drink', 'welcome drinks'],
  petals: ['petal', 'petals', 'garland'],
  gifts: ['return gift', 'return gifts'],
  candlelight: ['candlelight', 'candle light'],
  inroom: ['in room', 'in-room'],
  spa: ['spa', 'couple spa', 'massage'],
  secluded: ['secluded', 'private table'],
  cruise: ['cruise', 'cabana'],
  breakfast: ['surprise breakfast', 'breakfast in bed'],
  notes: ['love note', 'love notes'],
  photoshoot: ['photoshoot', 'photo shoot'],
  experience: ['mystery experience', 'surprise experience'],
  bbq: ['bbq', 'barbecue', 'grill'],
  finger: ['finger food'],
  premiumbar: ['premium bar'],
  desserts: ['dessert', 'desserts'],
  street: ['street food'],
  trek: ['trek', 'hike', 'hiking'],
  water: ['water sport', 'water sports', 'rafting'],
  bonfire: ['bonfire', 'camp fire'],
  biking: ['biking', 'cycling'],
  games: ['group games', 'games'],
};

const SERVICE_LOOKUP = [
  ...SHARED_CATEGORIES,
  ...Object.values(SPECIAL_CATEGORIES),
  SURPRISE_GIFTS,
].flatMap((cat) =>
  cat.options.map((o) => ({
    cat: cat.id,
    id: o.id,
    kws: SERVICE_SYNONYMS[o.id] ?? [o.label.toLowerCase(), o.id],
  })),
);

/** Ordered — earlier entries win (e.g. "mini bus" before "bus"). */
const VEHICLE_KEYWORDS: [string, string[]][] = [
  ['tempo', ['tempo traveller', 'tempo']],
  ['minibus', ['mini bus', 'minibus']],
  ['bus', ['bus', 'coach']],
  ['suv', ['suv', 'innova', 'ertiga']],
  ['sedan', ['sedan', 'dzire', 'etios']],
  ['hatchback', ['hatchback', 'small car']],
];

const has = (t: string, kw: string) => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(t);

// ---- Date parsing -----------------------------------------------------------

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];
const MONTH_RE =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DAY_RE = '(\\d{1,2})(?:st|nd|rd|th)?';

const monthIndex = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase());

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const todayISO = (now: Date) => iso(now.getFullYear(), now.getMonth(), now.getDate());

/**
 * Extract a tour date range from speech. Handles "24 to 28 December",
 * "December 24 to 28", "24 Dec to 2 Jan", and "24 December for 3 nights".
 * Years default to the next occurrence of that date.
 */
export function parseDates(raw: string, now = new Date()): { start: string; end: string } | undefined {
  const t = raw.toLowerCase();

  // Resolve a (day, month) pair to the next occurrence, unless a year is given.
  const resolve = (d: number, m: number, year?: number): string => {
    if (year) return iso(year, m, d);
    const y = now.getFullYear();
    const candidate = iso(y, m, d);
    return candidate < todayISO(now) ? iso(y + 1, m, d) : candidate;
  };

  const sep = '(?:to|until|till|through|-|–)';

  // "24 (December)? to 28 December (2026)?"
  let m = t.match(
    new RegExp(`${DAY_RE}\\s*(?:of\\s+)?(?:${MONTH_RE}\\s+)?${sep}\\s*${DAY_RE}\\s*(?:of\\s+)?${MONTH_RE}(?:\\s+(\\d{4}))?`, 'i'),
  );
  if (m) {
    const [, d1, mo1, d2, mo2, year] = m;
    const m2 = monthIndex(mo2);
    const m1 = mo1 ? monthIndex(mo1) : m2;
    const start = resolve(Number(d1), m1, year ? Number(year) : undefined);
    let end = resolve(Number(d2), m2, year ? Number(year) : undefined);
    // Cross-year range (e.g. 30 Dec to 2 Jan).
    if (end < start) end = iso(Number(start.slice(0, 4)) + 1, m2, Number(d2));
    return { start, end };
  }

  // "December 24 to 28 (2026)?"
  m = t.match(new RegExp(`${MONTH_RE}\\s+${DAY_RE}\\s*${sep}\\s*${DAY_RE}(?:\\s+(\\d{4}))?`, 'i'));
  if (m) {
    const [, mo, d1, d2, year] = m;
    const mi = monthIndex(mo);
    const start = resolve(Number(d1), mi, year ? Number(year) : undefined);
    let end = resolve(Number(d2), mi, year ? Number(year) : undefined);
    if (end < start) end = iso(Number(start.slice(0, 4)) + 1, mi, Number(d2));
    return { start, end };
  }

  // Single date ("on 24 December" / "December 24") + optional "for N nights/days".
  m =
    t.match(new RegExp(`${DAY_RE}\\s*(?:of\\s+)?${MONTH_RE}`, 'i')) ??
    t.match(new RegExp(`${MONTH_RE}\\s+${DAY_RE}`, 'i'));
  if (m) {
    const dayFirst = /^\d/.test(m[1]);
    const d = Number(dayFirst ? m[1] : m[2]);
    const mi = monthIndex(dayFirst ? m[2] : m[1]);
    const start = resolve(d, mi);
    const dur = t.match(/for\s+(\d+|[a-z]+)\s+(night|day)s?/i);
    const n = dur ? (toNum(dur[1]) ?? 0) : 0;
    const nights = dur?.[2] === 'day' ? Math.max(1, n - 1) : Math.max(1, n);
    const startDate = new Date(`${start}T00:00:00`);
    startDate.setDate(startDate.getDate() + (dur ? nights : 1));
    const end = iso(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    return { start, end };
  }

  return undefined;
}

export function parseVoiceInput(raw: string, now = new Date()): VoiceParseResult {
  const t = ` ${raw.toLowerCase()} `;
  const result: VoiceParseResult = { celebrations: [], services: {} };

  // Destination — only bookable ('on') destinations are applied.
  const dest = DESTINATIONS.find((d) => d.on && has(t, d.name.toLowerCase()));
  if (dest) result.destination = { id: dest.id, name: dest.name };

  // Tour dates
  const dates = parseDates(t, now);
  if (dates) result.dates = dates;

  // Occasions
  for (const c of CELEBRATIONS) {
    const kws = CELEB_SYNONYMS[c.id] ?? [c.name.toLowerCase()];
    if (kws.some((k) => has(t, k)) && !result.celebrations.includes(c.id))
      result.celebrations.push(c.id);
  }

  // Counts
  const adults = countBefore(t, ['guests', 'people', 'persons', 'adults', 'pax', 'members']);
  if (adults != null) result.adults = adults;
  const children = countBefore(t, ['kids', 'children', 'child']);
  if (children != null) result.children = children;
  const rooms = countBefore(t, ['rooms', 'room']);
  if (rooms != null) result.rooms = rooms;

  // Venue / time
  if (has(t, 'outdoor')) result.venue = 'outdoor';
  else if (has(t, 'indoor')) result.venue = 'indoor';
  for (const tod of ['morning', 'afternoon', 'evening', 'night']) if (has(t, tod)) result.time = tod;

  // Age group / gender / milestone-for
  if (has(t, 'kids') || has(t, 'children')) result.ageGroup = 'kids';
  else if (has(t, 'youth') || has(t, 'teen')) result.ageGroup = 'youth';
  else if (has(t, 'senior') || has(t, 'elderly')) result.ageGroup = 'senior';
  else if (has(t, 'adult')) result.ageGroup = 'adult';
  if (has(t, 'female') || has(t, 'girl') || has(t, 'woman')) result.gender = 'female';
  else if (has(t, 'male') || has(t, 'boy')) result.gender = 'male';
  if (has(t, 'product') || has(t, 'brand') || has(t, 'company')) result.milestoneFor = 'product';
  else if (has(t, 'individual') || has(t, 'person')) result.milestoneFor = 'individual';

  // Transport — mode, trip type and vehicle (trip/vehicle imply a cab)
  if (has(t, 'cab') || has(t, 'taxi')) result.transport = 'cab';
  else if (has(t, 'own transport') || has(t, 'self drive') || has(t, 'my car'))
    result.transport = 'own';
  if (
    has(t, 'complete trip') || has(t, 'end to end') || has(t, 'entire trip') || has(t, 'whole trip')
  )
    result.tripType = 'endtoend';
  else if (has(t, 'local trip') || has(t, 'local trips') || has(t, 'sightseeing'))
    result.tripType = 'local';
  const vehicle = VEHICLE_KEYWORDS.find(([, kws]) => kws.some((k) => has(t, k)));
  if (vehicle) result.vehicle = vehicle[0];
  if ((result.tripType || result.vehicle) && !result.transport) result.transport = 'cab';

  // Coupon — "coupon DEALNOW", "apply dealnow", or the bare code.
  const coupon = t.match(/coupon\s*(?:code)?\s*([a-z0-9]{4,})/i);
  if (coupon) result.coupon = coupon[1].toUpperCase();
  else if (has(t, 'dealnow')) result.coupon = 'DEALNOW';

  // Services
  for (const s of SERVICE_LOOKUP) {
    if (s.kws.some((k) => has(t, k))) {
      (result.services[s.cat] ??= []).push(s.id);
    }
  }

  return result;
}

/** True when the parse found nothing worth applying. */
export function isEmptyParse(r: VoiceParseResult): boolean {
  return (
    !r.destination &&
    r.celebrations.length === 0 &&
    !r.dates &&
    r.adults == null &&
    r.children == null &&
    r.rooms == null &&
    !r.venue &&
    !r.time &&
    !r.ageGroup &&
    !r.gender &&
    !r.milestoneFor &&
    !r.transport &&
    !r.tripType &&
    !r.vehicle &&
    !r.coupon &&
    Object.keys(r.services).length === 0
  );
}
