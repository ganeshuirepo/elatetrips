'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ThemeSwitcher from '@/components/layout/ThemeSwitcher';
import PartnerView from '@/components/partner/PartnerView';

/**
 * Standalone "Partner with us" page — reachable directly by URL / QR code so a
 * hotelier can fill the EOI without going through the planner. A slim header
 * keeps the brand + theme switcher; "Back to planner" routes home.
 */
export default function PartnerPage() {
  const router = useRouter();
  return (
    <>
      <header className="mx-auto flex max-w-[1060px] flex-wrap items-center justify-between gap-3 px-6 py-[18px]">
        <Link
          href="/"
          className="text-primary font-serif text-[23px] font-bold tracking-[-0.01em] no-underline"
        >
          Elate<span className="text-accent">Trips</span>
        </Link>
        <ThemeSwitcher />
      </header>
      <PartnerView onBack={() => router.push('/')} />
    </>
  );
}
