'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import { selectTransportFullReady, selectTransportHelp } from '@/store/selectors/planSelectors';
import TransportSection from './TransportSection';
import RoomsField from './RoomsField';
import HotelFilters from './HotelFilters';
import HotelList from './HotelList';
import LocalGuideNote from './LocalGuideNote';
import CostSummary from './CostSummary';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

/**
 * Step 3 — transport + hotels. Getting around (own vs cab, trip, vehicle,
 * pickup) is decided here, then the stay: each hotel expands inline (rooms,
 * packages, activities), so there is no separate detail page.
 */
export default function HotelsStep() {
  const dispatch = useAppDispatch();

  return (
    <div className="flex flex-col gap-6">
      {/* Transport sits on the canvas like the Plan widgets do. */}
      <TransportSection />

      {/* Rooms — decided alongside the stay */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
            Rooms
          </span>
          <span className="text-[12.5px] text-white/55">How many rooms for your stay</span>
        </div>
        <RoomsField />
      </div>

      {/* Filters + listing — two separate cards, flex-wrap reflow, no breakpoints */}
      <div className="flex flex-wrap gap-6">
        <Card className="min-w-[15rem] flex-[1_1_15rem] self-start">
          <HotelFilters />
        </Card>
        <Card className="min-w-[18rem] flex-[3_1_22rem]">
          <HotelList />
        </Card>
      </div>

      {/* Guide note, running total and the step actions, grounded in one card. */}
      <Card className="flex flex-col gap-5">
        <LocalGuideNote />
        <CostSummary />
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
