/** Date and currency formatters, ported verbatim from the original component. */

import { TRIP_DAYS_MAX } from '@/data/constants';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local (not UTC) ISO date `YYYY-MM-DD`. */
export function localISO(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function today(): string {
  return localISO(new Date());
}

/** First day of the month containing `iso` (or today). */
export function firstISO(iso?: string): string {
  const d = new Date((iso || today()) + 'T00:00');
  return localISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Inclusive list of ISO dates between start and end (capped at TRIP_DAYS_MAX). */
export function dayList(start: string, end: string): string[] {
  if (!start || !end) return [];
  const out: string[] = [];
  const d = new Date(start + 'T00:00');
  const e = new Date(end + 'T00:00');
  if (e < d) return [];
  let i = 0;
  while (d <= e && i < TRIP_DAYS_MAX) {
    out.push(localISO(d));
    d.setDate(d.getDate() + 1);
    i++;
  }
  return out;
}

/** "Mon, 5 Jun" */
export function fmtDay(v: string): string {
  return new Date(v + 'T00:00').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "5 Jun '26" */
export function fmtBig(v: string): string {
  const d = new Date(v + 'T00:00');
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
    " '" +
    String(d.getFullYear()).slice(2)
  );
}

/** "Monday" */
export function fmtSub(v: string): string {
  return new Date(v + 'T00:00').toLocaleDateString('en-GB', { weekday: 'long' });
}

/** ₹ with Indian digit grouping. */
export function inr(n: number): string {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

/** ₹ in lakhs once ≥ 1,00,000, else plain ₹. */
export function fmtLakh(n: number): string {
  if (n >= 100000) {
    const l = n / 100000;
    return '₹' + (Number.isInteger(l) ? l : l.toFixed(1)) + ' Lakh';
  }
  return '₹' + n.toLocaleString('en-IN');
}
