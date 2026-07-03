import { describe, it, expect } from 'vitest';
import {
  suggestDaylightSlot,
  daylightFits,
  daylightHours,
  dayHours,
  nextDaylightStart,
  nextServiceStart,
  moveTarget,
  autoFillTimeline,
  isNight,
  minutesLabel,
  parseTimeLabel,
  DAY_START_MIN,
  DAYLIGHT_END_MIN,
  DEFAULT_SERVICE_MIN,
  type TimelineItem,
} from './timeline';

const DAYS = ['2026-12-24', '2026-12-25', '2026-12-26'];

const item = (
  day: string,
  startMin: number,
  durationH: number,
  kind: TimelineItem['kind'] = 'place',
  n = 'x',
): TimelineItem => ({
  id: `${kind}:${n}:${day}:${startMin}`,
  kind,
  refId: n,
  name: n,
  day,
  startMin,
  durationH,
  meta: '',
});

describe('daylight sequencing (places & adventures)', () => {
  it('suggests the first day at 8 AM when empty', () => {
    expect(suggestDaylightSlot([], DAYS, 2)).toEqual({
      day: DAYS[0],
      startMin: DAY_START_MIN,
      packed: false,
    });
  });

  it('sequences after the last daylight item with a 30-minute gap', () => {
    const items = [item(DAYS[0], 8 * 60, 2)];
    expect(nextDaylightStart(items, DAYS[0])).toBe(10 * 60 + 30);
  });

  it('ignores night celebrations when sequencing daylight activities', () => {
    const items = [item(DAYS[0], 21 * 60, 2, 'service')];
    expect(nextDaylightStart(items, DAYS[0])).toBe(DAY_START_MIN);
  });

  it('never schedules a daylight activity past sunset — overflows to next day', () => {
    // 8:00 + 4h, then 12:30 + 4h → next would start 17:00; a 2h item ends 19:00 > sunset.
    const items = [item(DAYS[0], 8 * 60, 4), item(DAYS[0], 12 * 60 + 30, 4)];
    expect(daylightFits(items, DAYS[0], 2)).toBe(false);
    const slot = suggestDaylightSlot(items, DAYS, 2);
    expect(slot?.day).toBe(DAYS[1]);
  });

  it('returns null when no day can take the activity before sunset', () => {
    const items = DAYS.map((d) => item(d, 8 * 60, 9.5, 'place', `f${d}`));
    expect(suggestDaylightSlot(items, DAYS, 2)).toBeNull();
  });

  it('gives full-day outings (9h+) a dawn start on an empty day', () => {
    const slot = suggestDaylightSlot([], DAYS, 11); // Mudumalai-style safari
    expect(slot).toEqual({ day: DAYS[0], startMin: 6 * 60, packed: true });
  });

  it('flags packed days beyond the comfort hours', () => {
    const items = [item(DAYS[0], 8 * 60, 6.5), item(DAYS[1], 8 * 60, 6.5), item(DAYS[2], 8 * 60, 6.5)];
    const slot = suggestDaylightSlot(items, DAYS, 1.5);
    expect(slot?.packed).toBe(true);
  });
});

describe('celebration timing (any hour)', () => {
  it('defaults to early evening on an empty day', () => {
    expect(nextServiceStart([], DAYS[0])).toBe(DEFAULT_SERVICE_MIN);
  });

  it('sequences after the last service, even late night', () => {
    const items = [item(DAYS[0], 21 * 60, 2, 'service')];
    expect(nextServiceStart(items, DAYS[0])).toBe(23 * 60 + 30);
  });

  it('marks night and early-morning starts', () => {
    expect(isNight(23 * 60)).toBe(true);
    expect(isNight(4 * 60)).toBe(true);
    expect(isNight(10 * 60)).toBe(false);
    expect(isNight(DAYLIGHT_END_MIN)).toBe(true);
  });
});

describe('moveTarget (drag & drop between days)', () => {
  it('keeps a celebration’s clock time on the new day', () => {
    const svc = item(DAYS[0], 22 * 60, 2, 'service');
    expect(moveTarget([svc], svc, DAYS[2])).toEqual({ startMin: 22 * 60 });
  });

  it('re-sequences a place on the target day', () => {
    const moving = item(DAYS[0], 8 * 60, 2, 'place', 'mv');
    const other = item(DAYS[1], 8 * 60, 3, 'place', 'other');
    expect(moveTarget([moving, other], moving, DAYS[1])).toEqual({ startMin: 11 * 60 + 30 });
  });

  it('refuses to move a place onto a day that is full before sunset', () => {
    const moving = item(DAYS[0], 8 * 60, 3, 'place', 'mv');
    const full = item(DAYS[1], 8 * 60, 9.5, 'place', 'full');
    expect(moveTarget([moving, full], moving, DAYS[1])).toBeNull();
  });
});

describe('hours & labels', () => {
  it('separates daylight hours from total hours', () => {
    const items = [item(DAYS[0], 8 * 60, 2), item(DAYS[0], 21 * 60, 3, 'service')];
    expect(daylightHours(items, DAYS[0])).toBe(2);
    expect(dayHours(items, DAYS[0])).toBe(5);
  });

  it('round-trips labels and minutes across the full clock', () => {
    expect(minutesLabel(0)).toBe('12:00 AM');
    expect(minutesLabel(22 * 60 + 30)).toBe('10:30 PM');
    expect(parseTimeLabel('10:30 PM')).toBe(22 * 60 + 30);
  });
});

describe('autoFillTimeline', () => {
  it('seeds daylight place items from the AI planner', () => {
    const items = autoFillTimeline(DAYS, []);
    expect(items.length).toBeGreaterThan(5);
    expect(items.every((i) => i.kind === 'place' && DAYS.includes(i.day))).toBe(true);
  });
});
