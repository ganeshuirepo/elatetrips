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
 * Next sequential daylight start: after the day's last place/adventure.
 * Full-day outings (9h+, e.g. the Mudumalai safari) get a dawn start on an
 * empty day — exactly how such trips run in practice.
 */
export const nextDaylightStart = (items: TimelineItem[], day: string, durationH = 0): number => {
  const list = daylightOn(items, day);
  if (list.length === 0) return durationH >= 9 ? 6 * 60 : DAY_START_MIN;
  const end = Math.max(...list.map((i) => i.startMin + Math.round(i.durationH * 60)));
  return Math.max(end + GAP_MIN, DAY_START_MIN);
};

/** Can a daylight activity of `durationH` still finish before sunset that day? */
export const daylightFits = (items: TimelineItem[], day: string, durationH: number) =>
  nextDaylightStart(items, day, durationH) + Math.round(durationH * 60) <= DAYLIGHT_END_MIN;

export type SlotSuggestion = { day: string; startMin: number; packed: boolean };

/**
 * Sequential placement for places/adventures: the first day where the item
 * still fits before sunset — comfortable days first, then packed ones
 * (flagged). Null when every day is full: the UI says remove or extend.
 */
export function suggestDaylightSlot(
  items: TimelineItem[],
  days: string[],
  durationH: number,
): SlotSuggestion | null {
  for (const day of days) {
    if (daylightFits(items, day, durationH) && daylightHours(items, day) + durationH <= DAY_COMFORT_H)
      return { day, startMin: nextDaylightStart(items, day, durationH), packed: false };
  }
  for (const day of days) {
    if (daylightFits(items, day, durationH))
      return { day, startMin: nextDaylightStart(items, day, durationH), packed: true };
  }
  return null;
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
 * daylight activities re-sequence — or refuse (null) when the day is full.
 */
export function moveTarget(
  items: TimelineItem[],
  item: TimelineItem,
  day: string,
): { startMin: number } | null {
  if (item.day === day) return { startMin: item.startMin };
  if (item.kind === 'service') return { startMin: item.startMin };
  const rest = items.filter((i) => i.id !== item.id);
  return daylightFits(rest, day, item.durationH)
    ? { startMin: nextDaylightStart(rest, day, item.durationH) }
    : null;
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
