'use client';

import Button from '@mui/material/Button';
import { useAppDispatch } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import CelebrationGrid from '@/components/planner/plan/CelebrationGrid';
import Icon from '@/components/ui/Icon';

/** Step 2 — pick an occasion. Choosing one jumps straight to the Services step. */
export default function CelebrationStep() {
  const dispatch = useAppDispatch();

  return (
    <div className="flex max-w-[804px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span
          className="text-[11px] font-black tracking-[0.06em] uppercase"
          style={{ color: 'var(--accent)' }}
        >
          What are we celebrating?
        </span>
        <span className="text-[13px] text-white/60">
          Pick an occasion — we&apos;ll tailor your services and stays to suit.
        </span>
      </div>
      <CelebrationGrid onPick={() => dispatch(setStep('services'))} />

      <div className="flex border-t border-white/15 pt-4">
        <Button
          variant="text"
          onClick={() => dispatch(setStep('plan'))}
          startIcon={<Icon name="arrow-left" size={16} />}
          sx={{ color: 'rgba(255,255,255,.7)' }}
        >
          Back to plan
        </Button>
      </div>
    </div>
  );
}
