'use client';

import { useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { stepTravellers } from '@/store/slices/planSlice';
import { openOnly, setPopover, closeAllPopovers } from '@/store/slices/uiSlice';
import { selectPax } from '@/store/selectors/planSelectors';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import Stepper from '@/components/ui/Stepper';
import Icon from '@/components/ui/Icon';
import { TRAVELLERS_MAX } from '@/data/constants';

/**
 * Travellers segment (adults + children popover) — rendered as the third cell
 * inside the DatesField card, after Tour end. Rooms live on the Hotels step.
 */
export default function Travellers() {
  const dispatch = useAppDispatch();
  const { adults, children } = useAppSelector((s) => s.plan);
  const pax = useAppSelector(selectPax);
  const travOpen = useAppSelector((s) => s.ui.travOpen);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => dispatch(closeAllPopovers()), travOpen);

  const travSub = `${adults} Adult${adults === 1 ? '' : 's'}, ${children} ${
    children === 1 ? 'Child' : 'Children'
  }`;

  return (
    <div ref={ref} className="relative flex min-w-0 flex-1 items-stretch">
      <div
        onClick={() =>
          dispatch(travOpen ? setPopover({ key: 'travOpen', open: false }) : openOnly('travOpen'))
        }
        className="relative flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-[3px] py-[11px] pr-8 pl-4"
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
    </div>
  );
}
