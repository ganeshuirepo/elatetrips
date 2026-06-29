'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import HotelFilters from './HotelFilters';
import HotelList from './HotelList';
import HotelDetail from './HotelDetail';
import LocalGuideNote from './LocalGuideNote';
import CostSummary from './CostSummary';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

/** Step 3 — hotels, packages, activities and the running cost summary. */
export default function HotelsStep() {
  const dispatch = useAppDispatch();
  const detailOpen = useAppSelector((s) => !!s.hotel.hOpen);

  if (detailOpen) {
    return (
      <Card className="flex flex-col gap-6">
        <HotelDetail />
        <ContinueBar back={() => dispatch(setStep('plan'))} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
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
        <ContinueBar back={() => dispatch(setStep('plan'))} />
      </Card>
    </div>
  );
}

function ContinueBar({ back }: { back: () => void }) {
  const dispatch = useAppDispatch();
  return (
    <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <span className="text-muted flex items-center gap-2 text-[13px]">
        <Icon name="info-circle" size={16} /> Add any extras, then review your celebration plan.
      </span>
      <div className="flex gap-2">
        <Button variant="text" color="primary" onClick={back}>
          Back
        </Button>
        <Button
          variant="contained"
          color="primary"
          size="large"
          onClick={() => dispatch(setStep('shop'))}
          endIcon={<Icon name="arrow-right" size={18} />}
        >
          Continue to shopping
        </Button>
      </div>
    </div>
  );
}
