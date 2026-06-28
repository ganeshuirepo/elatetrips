import { describe, it, expect } from 'vitest';
import { localISO, dayList, inr, fmtLakh, firstISO } from './format';

describe('localISO', () => {
  it('formats a local date without UTC drift', () => {
    expect(localISO(new Date(2026, 5, 5))).toBe('2026-06-05');
    expect(localISO(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('firstISO', () => {
  it('snaps to the first of the month', () => {
    expect(firstISO('2026-06-17')).toBe('2026-06-01');
  });
});

describe('dayList', () => {
  it('returns an inclusive range', () => {
    expect(dayList('2026-06-01', '2026-06-03')).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
  });

  it('returns empty for missing or inverted ranges', () => {
    expect(dayList('', '2026-06-03')).toEqual([]);
    expect(dayList('2026-06-05', '2026-06-01')).toEqual([]);
  });
});

describe('currency', () => {
  it('formats ₹ with Indian grouping', () => {
    expect(inr(123456)).toBe('₹1,23,456');
    expect(inr(0)).toBe('₹0');
  });

  it('switches to lakhs at ≥ 1,00,000', () => {
    expect(fmtLakh(50000)).toBe('₹50,000');
    expect(fmtLakh(100000)).toBe('₹1 Lakh');
    expect(fmtLakh(150000)).toBe('₹1.5 Lakh');
  });
});
