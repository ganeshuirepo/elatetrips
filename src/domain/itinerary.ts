import { OOTY_PLACES, type OotyPlace } from '@/data/ootyPlaces';

/**
 * Date-aware day planner for Ooty. Deterministic heuristics over the curated
 * dataset: one geographic circuit per day, crowd-beating early starts, golden-
 * hour stops pinned to the evening, and interest tags weighting what makes the
 * cut on tight days. Swappable seam — an LLM planner can replace
 * `buildItinerary` and keep the same result shape.
 */

export interface ItineraryStop {
  placeId: string;
  name: string;
  /** e.g. "8:00 AM" */
  time: string;
  /** e.g. "~2h" */
  duration: string;
  note: string;
}

export interface ItineraryDay {
  date: string; // ISO
  title: string;
  stops: ItineraryStop[];
}

const CIRCUIT_ORDER = [
  'town-classics',
  'peaks-and-pykara',
  'coonoor',
  'avalanche',
  'falls-and-tribes',
  'mudumalai',
] as const;

const CIRCUIT_TITLES: Record<string, string> = {
  'town-classics': 'Ooty town classics',
  'peaks-and-pykara': 'Peaks, tea & the Pykara circuit',
  coonoor: 'Coonoor day out',
  avalanche: 'Avalanche & Emerald lakes',
  'falls-and-tribes': 'Falls, treks & Toda culture',
  mudumalai: 'Mudumalai wildlife safari',
};

const SLOT_RANK: Record<OotyPlace['slot'], number> = {
  early: 0,
  morning: 1,
  any: 2,
  afternoon: 3,
  golden: 4,
};

const DAY_START_MIN = 8 * 60;
const GOLDEN_MIN = 17 * 60;
const DAY_BUDGET_H = 7.5; // activity hours before travel buffers
const TRAVEL_BUFFER_H = 0.5;

const fmtTime = (mins: number): string => {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
};

const fmtDuration = (h: number): string => (h >= 1 ? `~${+h.toFixed(1)}h` : `~${Math.round(h * 60)}min`);

const matchCount = (place: OotyPlace, interests: string[]) =>
  place.tags.filter((t) => interests.includes(t)).length;

const score = (place: OotyPlace, interests: string[]) =>
  (5 - place.priority) * 2 + matchCount(place, interests) * 3;

/** Pick stops for one circuit-day within the time budget, interests first. */
function pickStops(circuit: string, interests: string[]): OotyPlace[] {
  const pool = OOTY_PLACES.filter((p) => p.circuit === circuit).sort(
    (a, b) => score(b, interests) - score(a, interests),
  );
  const chosen: OotyPlace[] = [];
  let used = 0;
  for (const p of pool) {
    // With interests chosen, filler spots that match nothing get skipped.
    if (interests.length > 0 && p.priority >= 3 && matchCount(p, interests) === 0) continue;
    if (used + p.durationH > DAY_BUDGET_H && chosen.length > 0) continue;
    chosen.push(p);
    used += p.durationH + TRAVEL_BUFFER_H;
  }
  return chosen.sort((a, b) => SLOT_RANK[a.slot] - SLOT_RANK[b.slot]);
}

/** Schedule chosen stops through the day; golden-hour stops pin to ~5 PM. */
function schedule(date: string, circuit: string, stops: OotyPlace[]): ItineraryDay {
  const out: ItineraryStop[] = [];
  let clock = circuit === 'mudumalai' ? 6 * 60 : DAY_START_MIN;
  let lunched = false;

  for (const p of stops) {
    if (p.slot === 'golden') clock = Math.max(clock, GOLDEN_MIN);
    if (!lunched && clock >= 12 * 60 + 30 && p.slot !== 'golden') {
      clock += 60; // lunch
      lunched = true;
    }
    out.push({
      placeId: p.id,
      name: p.name,
      time: fmtTime(clock),
      duration: fmtDuration(p.durationH),
      note: p.tip ?? p.bestTime,
    });
    clock += Math.round((p.durationH + TRAVEL_BUFFER_H) * 60);
  }
  return { date, title: CIRCUIT_TITLES[circuit], stops: out };
}

/**
 * Build a day-wise plan for the tour dates. Interests re-rank the later
 * circuits (day 1 always opens with the town classics) and decide what
 * makes the cut inside each day.
 */
export function buildItinerary(dates: string[], interests: string[]): ItineraryDay[] {
  if (dates.length === 0) return [];

  const rest = CIRCUIT_ORDER.slice(1).filter(
    // The long Mudumalai day only earns a slot on wildlife trips or long stays.
    (c) => c !== 'mudumalai' || interests.includes('wildlife') || dates.length >= 5,
  );
  const ranked =
    interests.length === 0
      ? rest
      : [...rest].sort((a, b) => {
          const total = (c: string) =>
            OOTY_PLACES.filter((p) => p.circuit === c).reduce((s, p) => s + matchCount(p, interests), 0);
          return total(b) - total(a);
        });

  const circuits = ['town-classics', ...ranked];

  return dates.map((date, i) => {
    const circuit = circuits[i];
    if (!circuit) {
      return {
        date,
        title: 'At leisure',
        stops: [
          {
            placeId: 'leisure',
            name: 'Resort time, spa & Charring Cross cafés',
            time: 'All day',
            duration: '',
            note: 'A slow day — re-visit a favourite spot or shop for Nilgiris tea & chocolate.',
          },
        ],
      };
    }
    return schedule(date, circuit, pickStops(circuit, interests));
  });
}
