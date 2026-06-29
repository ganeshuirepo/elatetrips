'use client';

import { useAppSelector } from '@/store/hooks';
import Header from './Header';
import PlannerView from '@/components/planner/PlannerView';
import ShopView from '@/components/shop/ShopView';
import PartnerView from '@/components/partner/PartnerView';
import WeddingEnquiry from '@/components/planner/wedding/WeddingEnquiry';
import AuthDialog from '@/components/auth/AuthDialog';

/**
 * Top-level client shell. Renders the persistent header and switches the body
 * between the planner wizard and the two shop catalogues based on `view`.
 */
export default function AppShell() {
  const view = useAppSelector((s) => s.ui.view);

  return (
    <>
      <Header />
      {view === 'planner' && <PlannerView />}
      {view === 'gifts' && <ShopView shop="gifts" />}
      {view === 'partner' && <PartnerView />}
      {view === 'wedding' && <WeddingEnquiry />}
      <AuthDialog />
    </>
  );
}
