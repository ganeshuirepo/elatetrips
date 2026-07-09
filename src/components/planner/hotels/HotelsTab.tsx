'use client';

import { useEffect, useState } from 'react';
import { useAppSelector } from '@/store/hooks';
import { selectShowHotels, selectPage1Ready } from '@/store/selectors/planSelectors';
import { HOTELS } from '@/data/hotels';
import HotelFilters from './HotelFilters';
import HotelList from './HotelList';
import HotelDetailView from './HotelDetailView';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

/**
 * Hotels tab — browse, filter and pick a stay. The listing appears once a
 * complete trip has been searched from the trip bar. "View details" swaps
 * the listing for a full detail page; selecting a room adds the stay to the
 * shared cart.
 */
export default function HotelsTab() {
  // Filters are always visible on desktop; on phones they open via the icon.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const openId = useAppSelector((s) => s.hotel.hOpen);
  const openHotel = HOTELS.find((h) => h.id === openId);
  const showHotels = useAppSelector(selectShowHotels);
  const datesReady = useAppSelector(selectPage1Ready);

  // Entering (or switching) the detail page starts at the top like a real page.
  useEffect(() => {
    if (openHotel) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [openHotel]);

  if (openHotel) {
    return <HotelDetailView hotel={openHotel} />;
  }

  // No listing until a complete trip has been searched.
  if (!showHotels) {
    return (
      <Card className="flex flex-col items-center gap-3 py-14 text-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: 'color-mix(in srgb, var(--primary) 10%, #fff)' }}
        >
          <Icon name="building" size={26} style={{ color: 'var(--primary)' }} />
        </span>
        <span className="text-ink text-[16px] font-extrabold">Search stays in Ooty</span>
        <span className="text-muted max-w-[22rem] text-[13px]">
          {datesReady
            ? 'Hit Search in the trip bar above to see hotels for your dates.'
            : 'Add your destination and travel dates in the trip bar above, then hit Search to see available stays.'}
        </span>
      </Card>
    );
  }

  return (
    <div className="flex flex-wrap gap-6">
      <div
        id="hotel-filters"
        className={`min-w-[15rem] flex-[1_1_15rem] self-start ${filtersOpen ? '' : 'hidden'} md:block`}
      >
        <Card>
          <HotelFilters />
        </Card>
      </div>
      <Card className="min-w-[18rem] flex-[3_1_22rem]">
        {/* Filter toggle — phones only; rooms & travellers live in the trip bar */}
        <div className="mb-4 flex items-center justify-end md:hidden">
          <button
            type="button"
            aria-label="Toggle filters"
            aria-expanded={filtersOpen}
            onClick={() =>
              setFiltersOpen((o) => {
                const next = !o;
                if (next)
                  setTimeout(
                    () =>
                      document
                        .getElementById('hotel-filters')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                    60,
                  );
                return next;
              })
            }
            className="border-line text-ink flex cursor-pointer items-center gap-1.5 rounded-[12px] border-[1.5px] bg-white px-3 py-2.5 text-[13px] font-bold"
            style={filtersOpen ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : {}}
          >
            <Icon name="adjustments-horizontal" size={17} /> Filters
          </button>
        </div>
        <HotelList />
      </Card>
    </div>
  );
}
