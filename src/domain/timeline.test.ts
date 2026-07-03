import { describe, it, expect } from 'vitest';
import {
  suggestDaylightSlot,
  daylightFits,
  daylightHours,
  dayHours,
  firstDaylightStart,
  nextServiceStart,
  moveTarget,
  endsAfterSunset,
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
      late: false,
    });
  });

  it('sequences after the last daylight item with a 30-minute gap', () => {
    const items = [item(DAYS[0], 8 * 60, 2)];
    expect(firstDaylightStart(items, DAYS[0], 1)).toBe(10 * 60 + 30);
  });

  it('ignores night celebrations when sequencing daylight activities', () => {
    const items = [item(DAYS[0], 21 * 60, 2, 'service')];
    expect(firstDaylightStart(items, DAYS[0], 1)).toBe(DAY_START_MIN);
  });

  it('re-uses the gap left by a deleted middle item', () => {
    // 8–10 AM and 1–5:30 PM remain; the 10:30–12:30 slot was deleted.
    const items = [item(DAYS[0], 8 * 60, 2, 'place', 'a'), item(DAYS[0], 13 * 60, 4.5, 'place', 'b')];
    expect(firstDaylightStart(items, DAYS[0], 1.5)).toBe(10 * 60 + 30);
    // …and an add is possible even though the last item ends at sunset.
    const lateOnly = [item(DAYS[0], 15 * 60 + 30, 2.5, 'place', 'late')]; // ends 6 PM
    expect(firstDaylightStart(lateOnly, DAYS[0], 2)).toBe(DAY_START_MIN);
  });

  it('skips gaps that are too small for the new item', () => {
    const items = [item(DAYS[0], 8 * 60, 2, 'place', 'a'), item(DAYS[0], 11 * 60, 3, 'place', 'b')];
    // Gap 10:30–10:30 is zero-width → lands after b at 2:30 PM.
    expect(firstDaylightStart(items, DAYS[0], 1)).toBe(14 * 60 + 30);
  });

  it('never schedules a daylight activity past sunset — overflows to next day', () => {
    // 8:00 + 4h, then 12:30 + 4h → next would start 17:00; a 2h item ends 19:00 > sunset.
    const items = [item(DAYS[0], 8 * 60, 4), item(DAYS[0], 12 * 60 + 30, 4)];
    expect(daylightFits(items, DAYS[0], 2)).toBe(false);
    const slot = suggestDaylightSlot(items, DAYS, 2);
    expect(slot?.day).toBe(DAYS[1]);
  });

  it('never blocks — falls back to a post-sunset slot flagged late', () => {
    const items = DAYS.map((d) => item(d, 8 * 60, 9.5, 'place', `f${d}`));
    const slot = suggestDaylightSlot(items, DAYS, 2);
    expect(slot.late).toBe(true);
    expect(slot.packed).toBe(true);
    expect(DAYS).toContain(slot.day);
  });

  it('gives full-day outings (9h+) a dawn start on an empty day', () => {
    const slot = suggestDaylightSlot([], DAYS, 11); // Mudumalai-style safari
    expect(slot).toEqual({ day: DAYS[0], startMin: 6 * 60, packed: true, late: false });
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
    expect(moveTarget([svc], svc, DAYS[2])).toEqual({ startMin: 22 * 60, late: false });
  });

  it('re-sequences a place on the target day', () => {
    const moving = item(DAYS[0], 8 * 60, 2, 'place', 'mv');
    const other = item(DAYS[1], 8 * 60, 3, 'place', 'other');
    expect(moveTarget([moving, other], moving, DAYS[1])).toEqual({
      startMin: 11 * 60 + 30,
      late: false,
    });
  });

  it('moving onto a full day lands after sunset with the late flag', () => {
    const moving = item(DAYS[0], 8 * 60, 3, 'place', 'mv');
    const full = item(DAYS[1], 8 * 60, 9.5, 'place', 'full');
    const t = moveTarget([moving, full], moving, DAYS[1]);
    expect(t.late).toBe(true);
    expect(t.startMin).toBe(18 * 60); // after the 5:30 PM end + 30 min
  });

  it('flags daylight items that run past sunset', () => {
    expect(endsAfterSunset(item(DAYS[0], 17 * 60, 2, 'place'))).toBe(true);
    expect(endsAfterSunset(item(DAYS[0], 15 * 60, 2, 'place'))).toBe(false);
    expect(endsAfterSunset(item(DAYS[0], 22 * 60, 2, 'service'))).toBe(false);
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
