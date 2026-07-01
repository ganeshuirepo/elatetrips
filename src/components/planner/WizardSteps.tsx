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
  planStepReady = false,
  planReady = false,
}: {
  planStepReady?: boolean;
  planReady?: boolean;
}) {
  const dispatch = useAppDispatch();
  const step = useAppSelector((s) => s.ui.step);

  // Plan opens the flow (where, when, transport); Celebration follows.
  const defs: StepDef[] = [
    { id: 'plan', label: 'Plan' },
    { id: 'celebration', label: 'Celebration' },
    { id: 'services', label: 'Services' },
    { id: 'stay', label: 'Hotels' },
    { id: 'shop', label: 'Shopping' },
    { id: 'review', label: 'Review' },
  ];

  const reach: Record<WizardStep, boolean> = {
    plan: true,
    celebration: planStepReady,
    services: planReady,
    stay: planReady,
    shop: planReady,
    review: planReady,
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
