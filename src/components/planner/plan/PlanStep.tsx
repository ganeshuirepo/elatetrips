'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import { selectPlanReady, selectPlanHelp } from '@/store/selectors/planSelectors';
import DestinationSearch from './DestinationSearch';
import WhenWho from './WhenWho';
import CelebrationGrid from './CelebrationGrid';
import CelebrationDays from './CelebrationDays';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

/** Step 1 — the full planning screen (where, when, who, what, transport). */
export default function PlanStep() {
  const dispatch = useAppDispatch();
  const planReady = useAppSelector(selectPlanReady);
  const help = useAppSelector(selectPlanHelp);

  // The Cab step (always shown) is next, where transport is chosen.
  const onContinue = () => dispatch(setStep('cab'));

  return (
    <div className="flex flex-col gap-6">
      <div
        className="grid items-start gap-6"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))' }}
      >
        {/* Left card — where, when & who, transport */}
        <Card className="flex flex-col gap-5">
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
        </Card>

        {/* Right card — celebrations + per-occasion day selection. */}
        <Card className="flex flex-col gap-5">
          <CelebrationGrid />
          <CelebrationDays />
        </Card>
      </div>

      {/* Action bar — its own slim card so the CTA stays grounded below the split. */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
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
            Continue to transport
          </Button>
        </div>
      </Card>
    </div>
  );
}
