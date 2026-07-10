'use client';

import { useAppSelector } from '@/store/hooks';
import Hero from '@/components/layout/Hero';
import Card from '@/components/ui/Card';
import TripBar from './TripBar';
import TabBar from './TabBar';
import HotelsTab from './hotels/HotelsTab';
import CabTab from './cab/CabTab';
import CelebrationsTab from './celebrations/CelebrationsTab';
import OnGroundTab from './services/OnGroundTab';
import ItineraryTab from './prefs/ItineraryTab';
import AboutElate from './landing/AboutElate';
import Offers from './landing/Offers';
import ShopView from '@/components/shop/ShopView';
import ReviewStep from './review/ReviewStep';
import PaymentStep from './payment/PaymentStep';

/**
 * The planner storefront: a shared trip bar (destination · dates ·
 * travellers) above six independent product tabs — Hotels, Cabs,
 * Celebrations & Experiences, Surprise Gifts, On-ground Services and the
 * Itinerary planner. No ordering, no gating: shop any tab alone or combine
 * them; everything meets in the shared cart, reviewed and paid on the
 * review/payment screens.
 */
export default function PlannerView() {
  const tab = useAppSelector((s) => s.ui.tab);
  const screen = useAppSelector((s) => s.ui.screen);
  const storefrontOpen = useAppSelector((s) => s.plan.storefrontOpen);

  if (screen === 'review') {
    return (
      <div className="mx-auto max-w-[1080px] px-6 pt-4">
        <ReviewStep />
      </div>
    );
  }
  if (screen === 'payment') {
    return (
      <div className="mx-auto max-w-[1080px] px-6 pt-4">
        <Card>
          <PaymentStep />
        </Card>
      </div>
    );
  }

  return (
    <>
      <Hero />
      <div className="mx-auto flex max-w-[1080px] flex-col gap-5 px-6 pt-2 pb-10">
        <TripBar />
        {/* Before the first search: a landing (About + Offers). After it, the
            storefront tabs stay open even while the trip is edited. */}
        {!storefrontOpen ? (
          <>
            <AboutElate />
            <Offers />
          </>
        ) : (
          <>
            <TabBar />
            {tab === 'hotels' ? (
              <HotelsTab />
            ) : tab === 'cabs' ? (
              <CabTab />
            ) : tab === 'celebrations' ? (
              <CelebrationsTab />
            ) : tab === 'gifts' ? (
              <ShopView shop="gifts" embedded />
            ) : tab === 'onground' ? (
              <OnGroundTab />
            ) : (
              <ItineraryTab />
            )}
          </>
        )}
      </div>
    </>
  );
}
