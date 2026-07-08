'use client';

import { useEffect, useState } from 'react';
import { useAppSelector } from '@/store/hooks';
import { HOTELS } from '@/data/hotels';
import RoomsField from './RoomsField';
import HotelFilters from './HotelFilters';
import HotelList from './HotelList';
import HotelDetailView from './HotelDetailView';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

/**
 * Hotels tab — browse, filter and pick a stay. "View details" on a listing
 * swaps the whole listing for a detail page with a "Back to hotels" return.
 * Selecting a room adds the stay to the shared cart; no step gating.
 */
export default function HotelsTab() {
  // Filters are always visible on desktop; on phones they open via the icon.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const openId = useAppSelector((s) => s.hotel.hOpen);
  const openHotel = HOTELS.find((h) => h.id === openId);

  // Entering (or switching) the detail page starts at the top like a real page.
  useEffect(() => {
    if (openHotel) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [openHotel]);

  if (openHotel) {
    return <HotelDetailView hotel={openHotel} />;
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
        <div className="mb-4 flex items-end justify-between gap-3">
          <RoomsField />
          {/* Filter toggle — phones only */}
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
            className="border-line text-ink flex cursor-pointer items-center gap-1.5 rounded-[12px] border-[1.5px] bg-white px-3 py-2.5 text-[13px] font-bold md:hidden"
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
