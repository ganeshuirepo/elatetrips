import { buildItinerary } from './itinerary';
import { OOTY_PLACES } from '@/data/ootyPlaces';

/**
 * The trip timeline: user-placed items (places, celebration services,
 * adventures) on specific days. Practical time windows apply — sightseeing
 * and adventures only run in daylight (till ~sunset), while celebrations may
 * happen at any hour, late night included. Places/adventures are placed
 * sequentially; services carry an explicit day + time.
 */

export type TimelineKind = 'place' | 'service' | 'adventure';

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  refId: string;
  name: string;
  /** ISO date the item is planned on. */
  day: string;
  /** Start time as minutes from midnight. */
  startMin: number;
  durationH: number;
  /** Secondary line — category, fee or price. */
  meta: string;
}

/** Sightseeing day starts here… */
export const DAY_START_MIN = 8 * 60;
/** …and daylight activities wrap up by sunset. */
export const DAYLIGHT_END_MIN = 18 * 60;
/** Default suggestion for celebrations — early evening. */
export const DEFAULT_SERVICE_MIN = 18 * 60 + 30;
/** A comfortable amount of daylight activity per day. */
export const DAY_COMFORT_H = 7;

const GAP_MIN = 30;

export const minutesLabel = (mins: number): string => {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
};

export const parseTimeLabel = (label: string): number => {
  const m = label.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return DAY_START_MIN;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return h * 60 + Number(m[2]);
};

/** Celebrations can start at any half-hour of the day or night. */
export const SERVICE_TIME_OPTIONS: number[] = Array.from({ length: 48 }, (_, i) => i * 30);

/** True when a start time falls outside daylight (moon marker in the UI). */
export const isNight = (startMin: number) => startMin < 6 * 60 || startMin >= DAYLIGHT_END_MIN;

export const itemsOn = (items: TimelineItem[], day: string) =>
  items.filter((i) => i.day === day).sort((a, b) => a.startMin - b.startMin);

/** All planned hours on a day (used for display + packed warnings). */
export const dayHours = (items: TimelineItem[], day: string) =>
  itemsOn(items, day).reduce((s, i) => s + i.durationH, 0);

const daylightOn = (items: TimelineItem[], day: string) =>
  itemsOn(items, day).filter((i) => i.kind !== 'service');

/** Daylight (sightseeing + adventure) hours on a day. */
export const daylightHours = (items: TimelineItem[], day: string) =>
  daylightOn(items, day).reduce((s, i) => s + i.durationH, 0);

/**
 * First opening in the day that fits a daylight activity — scans the gaps
 * BETWEEN existing items too, so deleting something in the middle frees its
 * slot for the next add. Full-day outings (9h+, e.g. the Mudumalai safari)
 * may start at dawn. Returns null when nothing fits before sunset.
 */
export const firstDaylightStart = (
  items: TimelineItem[],
  day: string,
  durationH: number,
): number | null => {
  const need = Math.round(durationH * 60);
  const list = daylightOn(items, day);
  let cursor = durationH >= 9 ? 6 * 60 : DAY_START_MIN;
  for (const it of list) {
    const gapEnd = it.startMin - GAP_MIN;
    if (cursor + need <= Math.min(gapEnd, DAYLIGHT_END_MIN)) return cursor;
    cursor = Math.max(cursor, it.startMin + Math.round(it.durationH * 60) + GAP_MIN);
  }
  return cursor + need <= DAYLIGHT_END_MIN ? cursor : null;
};

/** Can a daylight activity of `durationH` still fit somewhere that day? */
export const daylightFits = (items: TimelineItem[], day: string, durationH: number) =>
  firstDaylightStart(items, day, durationH) !== null;

/** A daylight activity scheduled to run past sunset — likely closed. */
export const endsAfterSunset = (item: TimelineItem) =>
  item.kind !== 'service' && item.startMin + Math.round(item.durationH * 60) > DAYLIGHT_END_MIN;

/**
 * Place on `day` even when sunset room is gone: use the first pre-sunset gap
 * when there is one, otherwise append after the last daylight item and flag
 * it `late` — the user is warned, never blocked.
 */
export function placeOnDay(
  items: TimelineItem[],
  day: string,
  durationH: number,
): { startMin: number; late: boolean } {
  const start = firstDaylightStart(items, day, durationH);
  if (start !== null) return { startMin: start, late: false };
  const list = daylightOn(items, day);
  const after =
    list.length === 0
      ? DAY_START_MIN
      : Math.max(...list.map((i) => i.startMin + Math.round(i.durationH * 60))) + 30;
  return { startMin: Math.min(after, 23 * 60), late: true };
}

export type SlotSuggestion = { day: string; startMin: number; packed: boolean; late: boolean };

/**
 * Sequential placement for places/adventures: the first day with a
 * comfortable pre-sunset gap, then any pre-sunset gap (flagged packed), and
 * as a last resort a post-sunset slot on the lightest day (flagged late) —
 * adding is never blocked, only warned about.
 */
export function suggestDaylightSlot(
  items: TimelineItem[],
  days: string[],
  durationH: number,
): SlotSuggestion {
  for (const day of days) {
    const start = firstDaylightStart(items, day, durationH);
    if (start !== null && daylightHours(items, day) + durationH <= DAY_COMFORT_H)
      return { day, startMin: start, packed: false, late: false };
  }
  for (const day of days) {
    const start = firstDaylightStart(items, day, durationH);
    if (start !== null) return { day, startMin: start, packed: true, late: false };
  }
  const lightest = [...days].sort((a, b) => daylightHours(items, a) - daylightHours(items, b))[0];
  return { day: lightest, ...placeOnDay(items, lightest, durationH), packed: true, late: true };
}

/** Suggested celebration time: after that day's last service, else evening. */
export const nextServiceStart = (items: TimelineItem[], day: string): number => {
  const list = itemsOn(items, day).filter((i) => i.kind === 'service');
  if (list.length === 0) return DEFAULT_SERVICE_MIN;
  const end = Math.max(...list.map((i) => i.startMin + Math.round(i.durationH * 60)));
  return Math.min(end + GAP_MIN, 23 * 60 + 30);
};

/**
 * Where an item lands when dropped on `day`. Services keep their clock time;
 * daylight activities re-sequence — spilling past sunset (flagged `late`)
 * rather than refusing when the day is already full.
 */
export function moveTarget(
  items: TimelineItem[],
  item: TimelineItem,
  day: string,
): { startMin: number; late: boolean } {
  if (item.day === day) return { startMin: item.startMin, late: endsAfterSunset(item) };
  if (item.kind === 'service') return { startMin: item.startMin, late: false };
  const rest = items.filter((i) => i.id !== item.id);
  return placeOnDay(rest, day, item.durationH);
}

/** Seed the timeline from the AI day-planner (places only, one tap). */
export function autoFillTimeline(days: string[], interests: string[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const day of buildItinerary(days, interests)) {
    for (const stop of day.stops) {
      const place = OOTY_PLACES.find((p) => p.id === stop.placeId);
      if (!place) continue; // skips the leisure placeholder
      out.push({
        id: `place:${place.id}:${day.date}`,
        kind: 'place',
        refId: place.id,
        name: place.name,
        day: day.date,
        startMin: parseTimeLabel(stop.time),
        durationH: place.durationH,
        meta: `${place.distanceKm} km · ${place.fee}`,
      });
    }
  }
  return out;
}
