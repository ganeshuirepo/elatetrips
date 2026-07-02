import { describe, it, expect } from 'vitest';
import { parseVoiceInput, parseDates, isEmptyParse } from './voiceParse';

/** Fixed reference date so year inference is deterministic. */
const NOW = new Date('2026-07-02T10:00:00');

describe('parseVoiceInput', () => {
  it('extracts occasion, destination, counts, venue, time and services', () => {
    const r = parseVoiceInput(
      'A birthday in Ooty for 6 guests, 2 rooms, outdoor in the evening, with a photographer, cake and DJ.',
    );
    expect(r.destination).toEqual({ id: 'ooty', name: 'Ooty' });
    expect(r.celebrations).toContain('birthday');
    expect(r.adults).toBe(6);
    expect(r.rooms).toBe(2);
    expect(r.venue).toBe('outdoor');
    expect(r.time).toBe('evening');
    expect(r.services.onground).toContain('photographer');
    expect(r.services.food).toContain('cake');
    expect(r.services.music).toContain('dj');
  });

  it('separates children from adults and infers the kids age group', () => {
    const r = parseVoiceInput('a kids birthday party for 4 adults and 10 kids');
    expect(r.adults).toBe(4);
    expect(r.children).toBe(10);
    expect(r.ageGroup).toBe('kids');
    expect(r.celebrations).toContain('birthday');
  });

  it('detects an anniversary with cab transport and romance services', () => {
    const r = parseVoiceInput('anniversary trip, we need a cab, book a couple spa and candlelight dinner');
    expect(r.celebrations).toContain('anniversary');
    expect(r.transport).toBe('cab');
    expect(r.services.romance).toEqual(expect.arrayContaining(['spa', 'candlelight']));
  });

  it('does not apply coming-soon destinations', () => {
    const r = parseVoiceInput('a honeymoon in Coorg');
    expect(r.destination).toBeUndefined(); // Coorg is not bookable
    expect(r.celebrations).toContain('honeymoon');
  });

  it('reports an empty parse for unrelated speech', () => {
    expect(isEmptyParse(parseVoiceInput('hello how are you today'))).toBe(true);
  });

  it('captures the full journey in one utterance: dates, transport details and coupon', () => {
    const r = parseVoiceInput(
      'A birthday in Ooty, 24 to 28 December, 6 guests, 2 rooms — cab for the complete trip in an SUV, coupon DEALNOW',
      NOW,
    );
    expect(r.dates).toEqual({ start: '2026-12-24', end: '2026-12-28' });
    expect(r.transport).toBe('cab');
    expect(r.tripType).toBe('endtoend');
    expect(r.vehicle).toBe('suv');
    expect(r.coupon).toBe('DEALNOW');
  });

  it('detects surprise-gift options', () => {
    const r = parseVoiceInput('add a gourmet hamper and a personalised keepsake');
    expect(r.services.surprisegifts).toEqual(expect.arrayContaining(['hamper', 'keepsake']));
  });

  it('implies a cab when only a vehicle or trip type is mentioned', () => {
    expect(parseVoiceInput('a tempo traveller for the whole trip').transport).toBe('cab');
    expect(parseVoiceInput('local trips only please').tripType).toBe('local');
  });

  it('applies a bare DEALNOW mention as the coupon', () => {
    expect(parseVoiceInput('use dealnow please').coupon).toBe('DEALNOW');
  });
});

describe('parseDates', () => {
  it('parses "24 to 28 december"', () => {
    expect(parseDates('from 24 to 28 december', NOW)).toEqual({
      start: '2026-12-24',
      end: '2026-12-28',
    });
  });

  it('parses "december 24 to 28"', () => {
    expect(parseDates('december 24 to 28', NOW)).toEqual({
      start: '2026-12-24',
      end: '2026-12-28',
    });
  });

  it('parses a range across months and ordinals', () => {
    expect(parseDates('30th december to 2nd january', NOW)).toEqual({
      start: '2026-12-30',
      end: '2027-01-02',
    });
  });

  it('rolls past dates to next year', () => {
    expect(parseDates('14 to 16 february', NOW)).toEqual({
      start: '2027-02-14',
      end: '2027-02-16',
    });
  });

  it('parses a start date with a nights duration', () => {
    expect(parseDates('starting 24 december for 4 nights', NOW)).toEqual({
      start: '2026-12-24',
      end: '2026-12-28',
    });
  });

  it('respects an explicit year', () => {
    expect(parseDates('10 to 12 march 2028', NOW)).toEqual({
      start: '2028-03-10',
      end: '2028-03-12',
    });
  });

  it('returns undefined when no date is present', () => {
    expect(parseDates('a birthday in ooty for 6 guests', NOW)).toBeUndefined();
  });
});
