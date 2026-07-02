'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import { selectTransportFullReady, selectTransportHelp } from '@/store/selectors/planSelectors';
import TransportSection from './TransportSection';
import RoomsField from './RoomsField';
import HotelFilters from './HotelFilters';
import HotelList from './HotelList';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

/**
 * Step 3 — transport + hotels. Getting around (own vs cab, trip, vehicle,
 * pickup) is decided here, then the stay: each hotel expands inline (rooms,
 * packages, activities), so there is no separate detail page.
 */
export default function HotelsStep() {
  const dispatch = useAppDispatch();
  // Filters are always visible on desktop; on phones they open via the icon.
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {/* Transport sits on the canvas like the Plan widgets do. */}
      <TransportSection />

      {/* Filters + listing — two separate cards, flex-wrap reflow */}
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

      {/* Step actions — sticky so Continue is always in reach. */}
      <Card className="sticky bottom-2 z-30 flex flex-col gap-5">
        <ContinueBar back={() => dispatch(setStep('services'))} />
      </Card>
    </div>
  );
}

function ContinueBar({ back }: { back: () => void }) {
  const dispatch = useAppDispatch();
  const transportReady = useAppSelector(selectTransportFullReady);
  const help = useAppSelector(selectTransportHelp);

  return (
    <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <span className="text-muted flex items-center gap-2 text-[13px]">
        <Icon name="info-circle" size={16} /> {help}
      </span>
      <div className="flex gap-2">
        <Button variant="text" color="primary" onClick={back}>
          Back
        </Button>
        <Button
          variant="contained"
          color="primary"
          size="large"
          disabled={!transportReady}
          onClick={() => dispatch(setStep('review'))}
          endIcon={<Icon name="arrow-right" size={18} />}
        >
          Continue to review
        </Button>
      </div>
    </div>
  );
}
