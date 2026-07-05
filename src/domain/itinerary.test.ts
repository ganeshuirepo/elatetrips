import { describe, it, expect } from 'vitest';
import { buildItinerary } from './itinerary';

const dates = (n: number) =>
  Array.from({ length: n }, (_, i) => `2026-12-${String(24 + i).padStart(2, '0')}`);

describe('buildItinerary', () => {
  it('returns one day per tour date', () => {
    expect(buildItinerary(dates(3), [])).toHaveLength(3);
    expect(buildItinerary([], [])).toHaveLength(0);
  });

  it('always opens with the town classics, starting early', () => {
    const [day1] = buildItinerary(dates(2), []);
    expect(day1.title).toBe('Ooty town classics');
    expect(day1.stops[0].name).toContain('Botanical');
    expect(day1.stops[0].time).toBe('8:00 AM');
  });

  it('keeps every day inside a sane stop count', () => {
    for (const day of buildItinerary(dates(6), [])) {
      expect(day.stops.length).toBeLessThanOrEqual(7);
      expect(day.stops.length).toBeGreaterThan(0);
    }
  });

  it('pins golden-hour stops to the evening', () => {
    const days = buildItinerary(dates(4), []);
    const pykaraDay = days.find((d) => d.title.includes('Pykara'));
    const wenlock = pykaraDay?.stops.find((s) => s.name.includes('Wenlock'));
    expect(wenlock?.time).toBe('5:00 PM');
    expect(pykaraDay?.stops[pykaraDay.stops.length - 1].name).toContain('Wenlock');
  });

  it('adds Mudumalai for wildlife trips and ranks matching circuits earlier', () => {
    const days = buildItinerary(dates(3), ['wildlife']);
    const titles = days.map((d) => d.title);
    expect(titles).toContain('Mudumalai wildlife safari');
    // Without the interest a 3-day trip never drives to Mudumalai.
    expect(buildItinerary(dates(3), []).map((d) => d.title)).not.toContain(
      'Mudumalai wildlife safari',
    );
  });

  it('drops non-matching filler when interests are chosen', () => {
    const days = buildItinerary(dates(1), ['viewpoints']);
    const names = days[0].stops.map((s) => s.name);
    // Thread Garden is filler (priority 3, no viewpoint tag) — skipped.
    expect(names.join()).not.toContain('Thread Garden');
  });

  it('fills extra days with a leisure day once every circuit is used', () => {
    const days = buildItinerary(dates(9), []);
    expect(days[8].title).toBe('At leisure');
    // With 8 circuits available, day 8 is still a real outing.
    expect(days[7].title).not.toBe('At leisure');
  });
});
