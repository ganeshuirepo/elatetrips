'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep, type WizardStep } from '@/store/slices/uiSlice';
import StepIndicator, { type StepItem, type StepState } from '@/components/layout/StepIndicator';

interface StepDef {
  id: WizardStep;
  label: string;
}

/**
 * Builds the step breadcrumb from the current step + reachability.
 *
 * The 'cab' step only appears when a cab was chosen. Reachability mirrors the
 * original `reach` map; the `planReady` / `transportFullReady` inputs are wired
 * to real plan & transport selectors in Phases 3–4. Until then they default to
 * the conservative "only Plan is reachable" state.
 */
export default function WizardSteps({
  showCab = false,
  planReady = false,
  transportFullReady = false,
  isWedding = false,
}: {
  showCab?: boolean;
  planReady?: boolean;
  transportFullReady?: boolean;
  isWedding?: boolean;
}) {
  const dispatch = useAppDispatch();
  const step = useAppSelector((s) => s.ui.step);

  // A Wedding selection collapses the usual flow into a two-step enquiry journey.
  const defs: StepDef[] = isWedding
    ? [
        { id: 'plan', label: 'Plan' },
        { id: 'wedding', label: 'Wedding details' },
      ]
    : [
        { id: 'plan', label: 'Plan' },
        ...(showCab ? [{ id: 'cab' as const, label: 'Cab' }] : []),
        { id: 'stay', label: 'Hotels' },
        { id: 'shop', label: 'Shopping' },
        { id: 'review', label: 'Review' },
      ];

  const reach: Record<WizardStep, boolean> = {
    plan: true,
    cab: planReady,
    stay: planReady && transportFullReady,
    shop: planReady && transportFullReady,
    review: planReady && transportFullReady,
    wedding: planReady,
  };

  const curIdx = defs.findIndex((d) => d.id === step);
  const steps: StepItem[] = defs.map((d, i) => {
    let state: StepState;
    if (d.id === step) state = 'active';
    else if (i < curIdx) state = 'done';
    else if (reach[d.id]) state = 'reachable';
    else state = 'locked';
    return { id: d.id, label: d.label, state };
  });

  return <StepIndicator steps={steps} onNavigate={(id) => dispatch(setStep(id))} />;
}
