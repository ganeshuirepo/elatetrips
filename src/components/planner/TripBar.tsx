'use client';

import { useAppSelector } from '@/store/hooks';
import { selectPage1Ready } from '@/store/selectors/planSelectors';
import DestinationSearch from './plan/DestinationSearch';
import DatesField from './plan/DatesField';
import Icon from '@/components/ui/Icon';

/**
 * Shared trip context above the tabs: destination, tour dates and travellers
 * (rooms live in the dates widget). Every tab prices and schedules from this
 * one bar — edit it anywhere, any time. Nothing is gated; a hint nudges when
 * dates are missing since stays and cabs price by dates.
 */
export default function TripBar() {
  const ready = useAppSelector(selectPage1Ready);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
          Your trip
        </span>
        <span className="text-[12.5px] text-white/55">
          {ready ? (
            'Ooty is live — more soon'
          ) : (
            <span className="flex items-center gap-1.5">
              <Icon name="info-circle" size={14} /> Pick a destination &amp; dates to price stays
              and cabs
            </span>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="min-w-[240px] flex-[2_1_240px]">
          <DestinationSearch />
        </div>
        <div className="min-w-[240px] flex-[3_1_460px]">
          <DatesField />
        </div>
      </div>
    </div>
  );
}
