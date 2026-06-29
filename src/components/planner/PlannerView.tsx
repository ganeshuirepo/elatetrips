'use client';

import { useAppSelector } from '@/store/hooks';
import { selectPlanReady, selectTransportFullReady } from '@/store/selectors/planSelectors';
import Hero from '@/components/layout/Hero';
import Card from '@/components/ui/Card';
import WizardSteps from './WizardSteps';
import PlanStep from './plan/PlanStep';
import CabStep from './cab/CabStep';
import HotelsStep from './hotels/HotelsStep';
import ShopStep from './shop/ShopStep';
import ReviewStep from './review/ReviewStep';

/** Planner wizard: step breadcrumb + the active step panel. */
export default function PlannerView() {
  const step = useAppSelector((s) => s.ui.step);
  const planReady = useAppSelector(selectPlanReady);
  const transportFullReady = useAppSelector(selectTransportFullReady);

  return (
    <>
      <Hero />
      <div className="mx-auto max-w-[1080px] px-6 pt-2">
        {/* Stepper sits on the canvas; each step then owns its card surface(s). */}
        <WizardSteps planReady={planReady} transportFullReady={transportFullReady} />
        {step === 'plan' ? (
          // The Plan screen is split into its own cards (see PlanStep).
          <PlanStep />
        ) : (
          <Card>
            {step === 'cab' && <CabStep />}
            {step === 'stay' && <HotelsStep />}
            {step === 'shop' && <ShopStep />}
            {step === 'review' && <ReviewStep />}
          </Card>
        )}
      </div>
    </>
  );
}
