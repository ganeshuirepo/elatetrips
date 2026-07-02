'use client';

import { useAppSelector } from '@/store/hooks';
import { selectPlanReady, selectPlanStepReady } from '@/store/selectors/planSelectors';
import Hero from '@/components/layout/Hero';
import Card from '@/components/ui/Card';
import WizardSteps from './WizardSteps';
import CelebrationStep from './celebration/CelebrationStep';
import PlanStep from './plan/PlanStep';
import ServicesStep from './services/ServicesStep';
import HotelsStep from './hotels/HotelsStep';
import ReviewStep from './review/ReviewStep';

/** Planner wizard: step breadcrumb + the active step panel. */
export default function PlannerView() {
  const step = useAppSelector((s) => s.ui.step);
  const planReady = useAppSelector(selectPlanReady);
  const planStepReady = useAppSelector(selectPlanStepReady);

  return (
    <>
      <Hero />
      <div className="mx-auto max-w-[1080px] px-6 pt-2">
        {/* Stepper sits on the canvas; each step then owns its card surface(s). */}
        <WizardSteps planStepReady={planStepReady} planReady={planReady} />
        {step === 'celebration' ? (
          <CelebrationStep />
        ) : step === 'plan' ? (
          // The Plan screen carries everything (where, when, transport) in one card.
          <PlanStep />
        ) : step === 'services' ? (
          // Celebration-services questionnaire, between Plan and Hotels.
          <ServicesStep />
        ) : step === 'stay' ? (
          // Hotels owns its surfaces too — filters + listing as separate cards.
          <HotelsStep />
        ) : (
          <Card>{step === 'review' && <ReviewStep />}</Card>
        )}
      </div>
    </>
  );
}
