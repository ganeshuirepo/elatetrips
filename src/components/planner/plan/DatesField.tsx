'use client';

import { useMemo, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { pickDay, clearDates, setViewMonth } from '@/store/slices/planSlice';
import { openOnly, setPopover, closeAllPopovers } from '@/store/slices/uiSlice';
import { buildCalendar, shiftViewMonth } from '@/domain/calendar';
import { firstISO, fmtBig, fmtSub } from '@/domain/format';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import Icon from '@/components/ui/Icon';

/** Tour start / end date bar with a two-month range calendar popover. */
export default function DatesField() {
  const dispatch = useAppDispatch();
  const { start, end, viewMonth } = useAppSelector((s) => s.plan);
  const calOpen = useAppSelector((s) => s.ui.calOpen);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => dispatch(closeAllPopovers()), calOpen);

  const model = useMemo(() => buildCalendar(start, end, viewMonth), [start, end, viewMonth]);

  const openCal = () => {
    dispatch(setViewMonth(firstISO(start)));
    dispatch(openOnly('calOpen'));
  };

  const dateCell = (label: string, iso: string) => (
    <button
      type="button"
      onClick={openCal}
      className="flex flex-1 flex-col items-start gap-[3px] border-none bg-transparent px-4 py-[11px] text-left"
    >
      <span className="text-muted text-[10.5px] font-black tracking-[0.05em] uppercase">
        {label}
      </span>
      <span className="text-ink truncate text-[16px] leading-[1.1] font-bold">
        {iso ? fmtBig(iso) : 'Select date'}
      </span>
      <span className="text-muted truncate text-[12px]">{iso ? fmtSub(iso) : 'Day of week'}</span>
    </button>
  );

  return (
    <div
      data-cal
      ref={ref}
      className="border-line relative flex h-full items-stretch rounded-[14px] border-[1.5px] bg-white"
    >
      {dateCell('Tour start', start)}
      <div className="my-[9px] w-px flex-none bg-[#ECE7DC]" />
      {dateCell('Tour end', end)}

      {calOpen && (
        <div className="border-line absolute top-[calc(100%+10px)] left-0 z-40 w-[27rem] max-w-[calc(100vw-2rem)] cursor-default rounded-[16px] border bg-white p-3 shadow-xl">
          <div className="mb-2.5 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              disabled={model.prevOff}
              onClick={() => dispatch(setViewMonth(shiftViewMonth(viewMonth, start, -1)))}
              className="text-primary flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-[#DAD6CC] bg-white disabled:opacity-40"
            >
              <Icon name="chevron-left" size={15} />
            </button>
            <span className="text-primary text-[13px] font-extrabold">{model.rangeLabel}</span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => dispatch(setViewMonth(shiftViewMonth(viewMonth, start, 1)))}
              className="text-primary flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-[#DAD6CC] bg-white"
            >
              <Icon name="chevron-right" size={15} />
            </button>
          </div>

          <div className="et-cal-months grid grid-cols-2 gap-3">
            {model.months.map((mo) => (
              <div key={mo.label}>
                <div className="text-ink mb-2 text-center text-[13px] font-bold">{mo.label}</div>
                <div className="grid grid-cols-7">
                  {model.weekdays.map((w, i) => (
                    <div key={i} className="text-muted py-1 text-center text-[11px] font-bold">
                      {w}
                    </div>
                  ))}
                  {mo.cells.map((c, i) => {
                    let bg = 'transparent';
                    let color = 'var(--ink)';
                    let cursor = 'pointer';
                    if (!c.inMonth) {
                      color = 'transparent';
                      cursor = 'default';
                    } else if (c.past) {
                      color = '#D3CFC5';
                      cursor = 'not-allowed';
                    } else if (c.isStart || c.isEnd) {
                      bg = 'var(--primary)';
                      color = '#fff';
                    } else if (c.between) {
                      bg = 'color-mix(in srgb, var(--primary) 11%, transparent)';
                      color = 'var(--primary)';
                    }
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={c.disabled}
                        onClick={
                          c.disabled
                            ? undefined
                            : () => {
                                // Selecting the END of the range completes it — close the picker.
                                const completesRange = !!start && !end && c.iso >= start;
                                dispatch(pickDay(c.iso));
                                if (completesRange)
                                  dispatch(setPopover({ key: 'calOpen', open: false }));
                              }
                        }
                        className="flex h-[30px] w-full items-center justify-center rounded-[8px] border-none text-[12px] font-bold"
                        style={{ background: bg, color, cursor }}
                      >
                        {c.day}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#EFEBE1] pt-3">
            <span className="text-muted text-[13px] font-semibold">{model.rangeLabel}</span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => dispatch(clearDates())}
                className="text-muted cursor-pointer rounded-[10px] border-[1.5px] border-[#DAD6CC] bg-white px-[14px] py-2 text-[13px] font-bold"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => dispatch(setPopover({ key: 'calOpen', open: false }))}
                className="text-primary cursor-pointer rounded-[10px] border-none px-[18px] py-2 text-[13px] font-bold"
                style={{ background: 'color-mix(in srgb, var(--primary) 7%, transparent)' }}
              >
                Done
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
