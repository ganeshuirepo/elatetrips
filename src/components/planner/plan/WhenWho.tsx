'use client';

import { useMemo, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { pickDay, clearDates, setViewMonth, stepTravellers } from '@/store/slices/planSlice';
import { openOnly, setPopover, closeAllPopovers } from '@/store/slices/uiSlice';
import { selectPax } from '@/store/selectors/planSelectors';
import { buildCalendar, shiftViewMonth } from '@/domain/calendar';
import { firstISO, fmtBig, fmtSub } from '@/domain/format';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import Stepper from '@/components/ui/Stepper';
import Icon from '@/components/ui/Icon';
import { TRAVELLERS_MAX } from '@/data/constants';

/**
 * Combined "When & who" widget: tour start / tour end / travellers share one bar,
 * with a two-month range calendar and a travellers stepper popover hanging off it.
 */
export default function WhenWho() {
  const dispatch = useAppDispatch();
  const { start, end, viewMonth, adults, children } = useAppSelector((s) => s.plan);
  const pax = useAppSelector(selectPax);
  const calOpen = useAppSelector((s) => s.ui.calOpen);
  const travOpen = useAppSelector((s) => s.ui.travOpen);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => dispatch(closeAllPopovers()), calOpen || travOpen);

  const model = useMemo(() => buildCalendar(start, end, viewMonth), [start, end, viewMonth]);

  const openCal = () => {
    dispatch(setViewMonth(firstISO(start)));
    dispatch(openOnly('calOpen'));
  };

  const travSub = `${adults} Adult${adults === 1 ? '' : 's'}, ${children} ${
    children === 1 ? 'Child' : 'Children'
  }`;

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

  const divider = <div className="my-[9px] w-px flex-none bg-[#ECE7DC]" />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-accent-ink text-[11px] font-black tracking-[0.06em] uppercase">
          When &amp; who
        </span>
        <span className="text-muted text-[12.5px]">Tour dates and travellers</span>
      </div>

      <div
        data-cal
        ref={ref}
        className="border-line relative flex items-stretch rounded-[14px] border-[1.5px] bg-white"
      >
        {dateCell('Tour start', start)}
        {divider}
        {dateCell('Tour end', end)}
        {divider}

        {/* Travellers */}
        <div
          onClick={() =>
            dispatch(travOpen ? setPopover({ key: 'travOpen', open: false }) : openOnly('travOpen'))
          }
          className="relative flex min-w-0 flex-1 flex-col items-start gap-[3px] py-[11px] pr-8 pl-4 cursor-pointer"
        >
          <span className="text-muted block text-[10.5px] font-black tracking-[0.05em] uppercase">
            Travellers
          </span>
          <span className="text-ink block w-full truncate text-[16px] leading-[1.1] font-bold">
            {pax} Traveller{pax === 1 ? '' : 's'}
          </span>
          <span className="text-muted block w-full truncate text-[12px]">{travSub}</span>
          <span className="text-muted absolute top-1/2 right-[14px] -translate-y-1/2 text-[16px]">
            <Icon name={travOpen ? 'chevron-up' : 'chevron-down'} />
          </span>

          {travOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="border-line absolute top-[calc(100%+9px)] right-0 z-30 w-[256px] cursor-default rounded-[14px] border bg-white px-4 py-1 shadow-xl"
            >
              <div className="flex items-center justify-between py-[11px]">
                <span>
                  <span className="text-ink block text-[14px] font-bold">Adults</span>
                  <span className="text-muted text-[12px]">Age 12+</span>
                </span>
                <Stepper
                  ariaLabel="Adults"
                  value={adults}
                  min={1}
                  max={TRAVELLERS_MAX}
                  onDec={() => dispatch(stepTravellers({ key: 'adults', delta: -1 }))}
                  onInc={() => dispatch(stepTravellers({ key: 'adults', delta: 1 }))}
                />
              </div>
              <div className="border-t border-[#EFEBE1]" />
              <div className="flex items-center justify-between py-[11px]">
                <span>
                  <span className="text-ink block text-[14px] font-bold">Children</span>
                  <span className="text-muted text-[12px]">Age 2–11</span>
                </span>
                <Stepper
                  ariaLabel="Children"
                  value={children}
                  min={0}
                  max={TRAVELLERS_MAX}
                  onDec={() => dispatch(stepTravellers({ key: 'children', delta: -1 }))}
                  onInc={() => dispatch(stepTravellers({ key: 'children', delta: 1 }))}
                />
              </div>
              <button
                type="button"
                onClick={() => dispatch(setPopover({ key: 'travOpen', open: false }))}
                className="text-primary my-1.5 mb-3 w-full cursor-pointer rounded-[10px] border-none py-[9px] text-[13.5px] font-bold"
                style={{ background: 'color-mix(in srgb, var(--primary) 7%, transparent)' }}
              >
                Done
              </button>
            </div>
          )}
        </div>

        {calOpen && (
          <div className="border-line absolute top-[calc(100%+10px)] right-0 left-0 z-40 max-w-[calc(100vw-2rem)] min-w-[32rem] cursor-default rounded-[16px] border bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
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

            <div className="et-cal-months grid grid-cols-2 gap-4">
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
                          onClick={c.disabled ? undefined : () => dispatch(pickDay(c.iso))}
                          className="flex h-[33px] w-full items-center justify-center rounded-[9px] border-none text-[12.5px] font-bold"
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
    </div>
  );
}
