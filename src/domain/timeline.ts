import { buildItinerary } from './itinerary';
import { OOTY_PLACES } from '@/data/ootyPlaces';

/**
 * The trip timeline: user-placed items (places, celebration services,
 * adventures) on specific days and times. Capacity rules keep days humane —
 * a comfort threshold triggers "packed day" warnings and a hard cap blocks
 * over-planning, pushing new items to the next day with room.
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

/** A comfortable day of sightseeing/celebrations, incl. travel & breaks. */
export const DAY_COMFORT_H = 7;
/** Hard cap — beyond this, adding is blocked and the next day is suggested. */
export const DAY_CAPACITY_H = 9;
export const DAY_START_MIN = 8 * 60;
const GAP_MIN = 30;
const LATEST_START_MIN = 20 * 60;

export const minutesLabel = (mins: number): string => {
  const h24 = Math.floor(mins / 60);
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

/** Half-hour start-time choices from 6 AM to 8 PM. */
export const TIME_OPTIONS: number[] = Array.from(
  { length: (LATEST_START_MIN - 6 * 60) / 30 + 1 },
  (_, i) => 6 * 60 + i * 30,
);

export const itemsOn = (items: TimelineItem[], day: string) =>
  items.filter((i) => i.day === day).sort((a, b) => a.startMin - b.startMin);

/** Planned hours on a day (durations only — the comfort cap absorbs travel). */
export const dayHours = (items: TimelineItem[], day: string) =>
  itemsOn(items, day).reduce((s, i) => s + i.durationH, 0);

/** Next free sequential start on a day: after the last item, 30 min gap. */
export const nextStart = (items: TimelineItem[], day: string): number => {
  const list = itemsOn(items, day);
  if (list.length === 0) return DAY_START_MIN;
  const end = Math.max(...list.map((i) => i.startMin + Math.round(i.durationH * 60)));
  return Math.min(Math.max(end + GAP_MIN, DAY_START_MIN), LATEST_START_MIN);
};

export type SlotSuggestion = { day: string; startMin: number; packed: boolean };

/**
 * Where should this item go? The first day it fits comfortably; failing that
 * the first day under the hard cap (flagged `packed`); null when every day is
 * full — the UI should tell the user to remove something or extend the trip.
 */
export function suggestSlot(
  items: TimelineItem[],
  days: string[],
  durationH: number,
): SlotSuggestion | null {
  for (const day of days) {
    if (dayHours(items, day) + durationH <= DAY_COMFORT_H)
      return { day, startMin: nextStart(items, day), packed: false };
  }
  for (const day of days) {
    if (dayHours(items, day) + durationH <= DAY_CAPACITY_H)
      return { day, startMin: nextStart(items, day), packed: true };
  }
  return null;
}

/** Can `durationH` land on `day` at all? Used when the user picks a day manually. */
export const fitsOn = (items: TimelineItem[], day: string, durationH: number) =>
  dayHours(items, day) + durationH <= DAY_CAPACITY_H;

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
