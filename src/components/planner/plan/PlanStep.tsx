'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import { selectPlanStepReady, selectPlanHelp } from '@/store/selectors/planSelectors';
import DestinationSearch from './DestinationSearch';
import DatesField from './DatesField';
import CelebrationGrid from './CelebrationGrid';
import Icon from '@/components/ui/Icon';

/**
 * Step 1 — the full planning screen: where & when (destination, tour dates),
 * travellers & rooms, then the celebration picker. Transport is chosen later,
 * on the Hotels step.
 */
export default function PlanStep() {
  const dispatch = useAppDispatch();
  const stepReady = useAppSelector(selectPlanStepReady);
  const help = useAppSelector(selectPlanHelp);

  return (
    // No card surface — the white widgets float directly on the dark canvas.
    // Kept compact so the whole step (incl. Continue) fits one viewport.
    <div className="flex flex-col gap-4">
      {/* Where & when — destination and tour dates share one row */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
            Where &amp; when
          </span>
          <span className="text-[12.5px] text-white/55">Ooty is live — more soon</span>
        </div>
        <div className="flex flex-wrap items-stretch gap-3">
          <div className="min-w-[240px] flex-[2_1_240px]">
            <DestinationSearch />
          </div>
          <div className="min-w-[360px] flex-[3_1_460px]">
            <DatesField />
          </div>
        </div>
      </div>

      {/* Celebration — merged from the former Celebration step */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
            What are we celebrating?
          </span>
          <span className="text-[12.5px] text-white/55">
            Pick one or more occasions — we&apos;ll tailor your services and stays to suit.
          </span>
        </div>
        <CelebrationGrid />
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-3">
        <span className="flex items-center gap-2 text-[13px] text-white/65">
          <Icon name="info-circle" size={16} /> {help}
        </span>
        <div className="flex gap-2">
          <Button
            variant="contained"
            size="large"
            disabled={!stepReady}
            onClick={() => dispatch(setStep('services'))}
            endIcon={<Icon name="arrow-right" size={18} />}
            sx={{
              background: 'linear-gradient(180deg,#e9c97f,#d4a94f)',
              color: '#08201f',
              fontWeight: 800,
              boxShadow: 'none',
              '&:hover': { background: 'linear-gradient(180deg,#edd089,#d9af55)', boxShadow: 'none' },
              '&.Mui-disabled': { background: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.4)' },
            }}
          >
            Continue to services
          </Button>
        </div>
      </div>
    </div>
  );
}
