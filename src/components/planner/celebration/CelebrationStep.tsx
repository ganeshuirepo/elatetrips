'use client';

import { useAppDispatch } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import CelebrationGrid from '@/components/planner/plan/CelebrationGrid';

/** Step 1 — pick an occasion. Choosing one jumps straight to the Plan step. */
export default function CelebrationStep() {
  const dispatch = useAppDispatch();

  return (
    <div className="mx-auto flex max-w-[804px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span
          className="text-[11px] font-black tracking-[0.06em] uppercase"
          style={{ color: 'var(--accent)' }}
        >
          What are we celebrating?
        </span>
        <span className="text-[13px] text-white/60">
          Pick an occasion to start planning — you can fine-tune the rest next.
        </span>
      </div>
      <CelebrationGrid onPick={() => dispatch(setStep('plan'))} />
    </div>
  );
}
