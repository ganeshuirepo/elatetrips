/** Pure two-month calendar grid builder for the tour date range picker. */

import { localISO, firstISO, today as todayISO, fmtDay } from './format';

export interface CalCell {
  iso: string;
  day: number | '';
  inMonth: boolean;
  past: boolean;
  isStart: boolean;
  isEnd: boolean;
  between: boolean;
  disabled: boolean;
}

export interface CalMonth {
  label: string;
  cells: CalCell[];
}

export interface CalendarModel {
  weekdays: string[];
  months: CalMonth[];
  /** True when the previous-month nav should be disabled (already at this month). */
  prevOff: boolean;
  prompt: string;
  rangeLabel: string;
}

export const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Build the displayed two months given the range and the visible month. */
export function buildCalendar(start: string, end: string, viewMonth: string): CalendarModel {
  const today = todayISO();
  const base = new Date((viewMonth || firstISO(start)) + 'T00:00');
  const prevOff = localISO(new Date(base.getFullYear(), base.getMonth(), 1)) <= firstISO(today);

  const months: CalMonth[] = [0, 1].map((off) => {
    const m = new Date(base.getFullYear(), base.getMonth() + off, 1);
    const y = m.getFullYear();
    const mo = m.getMonth();
    const gridStart = new Date(y, mo, 1 - new Date(y, mo, 1).getDay());
    const cells: CalCell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = localISO(d);
      const inMonth = d.getMonth() === mo;
      const past = iso < today;
      cells.push({
        iso,
        day: inMonth ? d.getDate() : '',
        inMonth,
        past,
        isStart: !!start && iso === start,
        isEnd: !!end && iso === end,
        between: !!start && !!end && iso > start && iso < end,
        disabled: !inMonth || past,
      });
    }
    return { label: m.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), cells };
  });

  let rangeLabel = 'Select your tour start date';
  if (start && !end) rangeLabel = 'Now select your end date';
  else if (start && end) rangeLabel = `${fmtDay(start)} → ${fmtDay(end)}`;

  return {
    weekdays: WEEKDAYS,
    months,
    prevOff,
    prompt: !start ? 'Pick tour start' : !end ? 'Pick tour end' : 'Tour dates',
    rangeLabel,
  };
}

/** Shift the visible month by `n` months, returning the new first-of-month ISO. */
export function shiftViewMonth(viewMonth: string, start: string, n: number): string {
  const d = new Date((viewMonth || firstISO(start)) + 'T00:00');
  d.setMonth(d.getMonth() + n);
  return localISO(new Date(d.getFullYear(), d.getMonth(), 1));
}
