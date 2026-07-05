import Link from 'next/link';
import ThemeSwitcher from '@/components/layout/ThemeSwitcher';

/**
 * Shared slim header for the partner area (chooser + per-track onboarding
 * forms) — reachable directly by URL / QR code, so it keeps the brand and
 * theme switcher without the full app shell.
 */
export default function PartnerLayout({ children }: { children: React.ReactNode }) {
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
      {children}
    </>
  );
}
