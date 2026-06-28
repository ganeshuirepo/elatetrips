'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import {
  selectPlanReady,
  selectShowCab,
  selectPlanHelp,
  selectIsWedding,
} from '@/store/selectors/planSelectors';
import DestinationSearch from './DestinationSearch';
import WhenWho from './WhenWho';
import CelebrationGrid from './CelebrationGrid';
import CelebrationDays from './CelebrationDays';
import TransportPicker from './TransportPicker';
import Icon from '@/components/ui/Icon';

/** Step 1 — the full planning screen (where, when, who, what, transport). */
export default function PlanStep() {
  const dispatch = useAppDispatch();
  const planReady = useAppSelector(selectPlanReady);
  const showCab = useAppSelector(selectShowCab);
  const help = useAppSelector(selectPlanHelp);
  const isWedding = useAppSelector(selectIsWedding);

  // A Wedding selection diverts the journey straight to the enquiry form.
  const onContinue = () =>
    dispatch(setStep(isWedding ? 'wedding' : showCab ? 'cab' : 'stay'));

  return (
    <div className="flex flex-col gap-6">
      <div
        className="grid items-start gap-7"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))' }}
      >
        {/* Left — where, when & who, transport */}
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-accent-ink text-[11px] font-black tracking-[0.06em] uppercase">
                Where to?
              </span>
              <span className="text-muted text-[12.5px]">Ooty is live — more soon</span>
            </div>
            <DestinationSearch />
          </div>
          <WhenWho />
          <TransportPicker />
        </div>

        {/* Right — celebrations */}
        <div className="flex flex-col gap-5">
          <CelebrationGrid />
          <CelebrationDays />
        </div>
      </div>

      {/* Action bar */}
      <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <span className="text-muted flex items-center gap-2 text-[13px]">
          <Icon name="info-circle" size={16} /> {help}
        </span>
        <Button
          variant="contained"
          color="primary"
          size="large"
          disabled={!planReady}
          onClick={onContinue}
          endIcon={<Icon name="arrow-right" size={18} />}
        >
          {isWedding ? 'Continue to wedding details' : 'Continue to hotels'}
        </Button>
      </div>
    </div>
  );
}
