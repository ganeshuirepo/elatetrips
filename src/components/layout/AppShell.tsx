'use client';

import { useAppSelector } from '@/store/hooks';
import Header from './Header';
import PlannerView from '@/components/planner/PlannerView';
import PartnerBenefits from '@/components/partner/PartnerBenefits';
import WeddingEnquiry from '@/components/planner/wedding/WeddingEnquiry';
import AuthDialog from '@/components/auth/AuthDialog';
import VoiceAssistant from '@/components/voice/VoiceAssistant';

/**
 * Top-level client shell. Renders the persistent header and switches the body
 * between the planner storefront, partner EOI and the wedding enquiry.
 */
export default function AppShell() {
  const view = useAppSelector((s) => s.ui.view);

  return (
    <>
      <Header />
      {view === 'planner' && <PlannerView />}
      {view === 'partner' && <PartnerBenefits />}
      {view === 'wedding' && <WeddingEnquiry />}
      <AuthDialog />
      <VoiceAssistant />
    </>
  );
}
