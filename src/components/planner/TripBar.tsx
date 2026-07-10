'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { search } from '@/store/slices/planSlice';
import { setTab } from '@/store/slices/uiSlice';
import { selectPage1Ready } from '@/store/selectors/planSelectors';
import DestinationSearch from './plan/DestinationSearch';
import DatesField from './plan/DatesField';
import Icon from '@/components/ui/Icon';

/**
 * Shared trip context above the tabs: destination, tour dates, travellers &
 * rooms, and a Search button. Every tab prices from this bar; Search reveals
 * the hotel listing (and jumps to the Hotels tab) once a destination and
 * dates are set.
 */
export default function TripBar() {
  const dispatch = useAppDispatch();
  const ready = useAppSelector(selectPage1Ready);

  const onSearch = () => {
    if (!ready) return;
    dispatch(search());
    dispatch(setTab('hotels'));
  };

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
              <Icon name="info-circle" size={14} /> Pick a destination &amp; dates, then search
              stays
            </span>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="min-w-[200px] flex-[2_1_200px]">
          <DestinationSearch />
        </div>
        <div className="min-w-[290px] flex-[3_1_380px]">
          <DatesField />
        </div>
        <button
          type="button"
          onClick={onSearch}
          disabled={!ready}
          aria-label="Search stays"
          className="flex w-full flex-none items-center justify-center gap-2 rounded-[14px] px-8 text-[15px] font-extrabold transition-opacity sm:w-auto"
          style={{
            background: ready ? 'linear-gradient(180deg,#e9c97f,#d4a94f)' : 'rgba(255,255,255,.12)',
            color: ready ? '#08201F' : 'rgba(255,255,255,.45)',
            cursor: ready ? 'pointer' : 'not-allowed',
            minHeight: 44,
          }}
        >
          <Icon name="search" size={18} /> Search
        </button>
      </div>
    </div>
  );
}
