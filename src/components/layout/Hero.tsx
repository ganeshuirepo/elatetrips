'use client';

import { useAppSelector } from '@/store/hooks';

/** Compact hero strip shown above the planner card (toggleable via uiSlice). */
export default function Hero() {
  const heroShown = useAppSelector((s) => s.ui.heroShown);
  const view = useAppSelector((s) => s.ui.view);
  if (!heroShown || view !== 'planner') return null;

  return (
    <section className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-[13px] px-6 pt-[2px] pb-2">
      <span
        className="text-accent-ink inline-block rounded-full px-[11px] py-1 text-[11px] font-black tracking-[0.05em] uppercase"
        style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
      >
        Celebration-first travel
      </span>
      <h1 className="text-primary m-0 font-serif text-2xl leading-[1.1] font-bold tracking-[-0.01em]">
        Plan your perfect celebration trip
      </h1>
      <span className="text-muted text-[13px]">
        Where, when, who and what — booked together in one go.
      </span>
    </section>
  );
}
