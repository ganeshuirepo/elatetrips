import { describe, it, expect } from 'vitest';
import {
  suggestSlot,
  fitsOn,
  dayHours,
  nextStart,
  autoFillTimeline,
  minutesLabel,
  parseTimeLabel,
  DAY_START_MIN,
  type TimelineItem,
} from './timeline';

const DAYS = ['2026-12-24', '2026-12-25', '2026-12-26'];

const item = (day: string, startMin: number, durationH: number, n = 'x'): TimelineItem => ({
  id: `t:${n}:${day}:${startMin}`,
  kind: 'place',
  refId: n,
  name: n,
  day,
  startMin,
  durationH,
  meta: '',
});

describe('timeline capacity & sequencing', () => {
  it('suggests the first day at 8 AM when empty', () => {
    expect(suggestSlot([], DAYS, 2)).toEqual({ day: DAYS[0], startMin: DAY_START_MIN, packed: false });
  });

  it('sequences after the last item with a 30-minute gap', () => {
    const items = [item(DAYS[0], 8 * 60, 2)];
    expect(nextStart(items, DAYS[0])).toBe(10 * 60 + 30);
    expect(suggestSlot(items, DAYS, 1.5)?.startMin).toBe(10 * 60 + 30);
  });

  it('overflows to the next day once a day passes the comfort limit', () => {
    const items = [item(DAYS[0], 8 * 60, 4), item(DAYS[0], 13 * 60, 3)]; // 7h — comfortable max
    const slot = suggestSlot(items, DAYS, 2);
    expect(slot?.day).toBe(DAYS[1]);
    expect(slot?.packed).toBe(false);
  });

  it('flags packed days when only hard-cap space remains everywhere', () => {
    const items = DAYS.map((d) => item(d, 8 * 60, 6.5, `f${d}`));
    const slot = suggestSlot(items, DAYS, 2);
    expect(slot?.packed).toBe(true);
  });

  it('returns null when no day can take the item', () => {
    const items = DAYS.map((d) => item(d, 8 * 60, 8.5, `f${d}`));
    expect(suggestSlot(items, DAYS, 2)).toBeNull();
    expect(fitsOn(items, DAYS[0], 2)).toBe(false);
  });

  it('tracks day hours', () => {
    const items = [item(DAYS[0], 8 * 60, 2), item(DAYS[0], 11 * 60, 1.5)];
    expect(dayHours(items, DAYS[0])).toBe(3.5);
    expect(dayHours(items, DAYS[1])).toBe(0);
  });
});

describe('time labels', () => {
  it('round-trips labels and minutes', () => {
    expect(minutesLabel(8 * 60)).toBe('8:00 AM');
    expect(minutesLabel(17 * 60 + 30)).toBe('5:30 PM');
    expect(parseTimeLabel('5:30 PM')).toBe(17 * 60 + 30);
    expect(parseTimeLabel('12:00 PM')).toBe(12 * 60);
  });
});

describe('autoFillTimeline', () => {
  it('seeds place items from the AI planner with parsed times', () => {
    const items = autoFillTimeline(DAYS, []);
    expect(items.length).toBeGreaterThan(5);
    const first = items.find((i) => i.day === DAYS[0]);
    expect(first?.kind).toBe('place');
    expect(first?.startMin).toBe(DAY_START_MIN);
    // every item lands on a tour day and carries a duration
    expect(items.every((i) => DAYS.includes(i.day) && i.durationH > 0)).toBe(true);
  });
});
