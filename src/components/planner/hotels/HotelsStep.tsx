'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import HotelFilters from './HotelFilters';
import HotelList from './HotelList';
import HotelDetail from './HotelDetail';
import WeddingForm from './WeddingForm';
import LocalGuideNote from './LocalGuideNote';
import CostSummary from './CostSummary';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

/** Step 3 — hotels, packages, activities and the running cost summary. */
export default function HotelsStep() {
  const dispatch = useAppDispatch();
  const detailOpen = useAppSelector((s) => !!s.hotel.hOpen);
  const hasWedding = useAppSelector((s) => s.plan.celebs.includes('wedding'));

  if (detailOpen) {
    return (
      <div className="flex flex-col gap-6">
        <HotelDetail />
        <ContinueBar back={() => dispatch(setStep('cab'))} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {/* Filters + listing — each in its own card, flex-wrap reflow, no breakpoints */}
      <div className="flex flex-wrap gap-6">
        <Card className="min-w-[15rem] flex-[1_1_15rem] self-start">
          <HotelFilters />
        </Card>
        <div className="min-w-[18rem] flex-[3_1_22rem]">
          <HotelList />
        </div>
      </div>

      {hasWedding && <WeddingForm />}

      <LocalGuideNote />
      <CostSummary />

      <ContinueBar back={() => dispatch(setStep('cab'))} />
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
