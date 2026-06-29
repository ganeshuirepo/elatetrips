'use client';

import { useAppSelector } from '@/store/hooks';

/** Compact hero strip shown above the planner card (toggleable via uiSlice). */
export default function Hero() {
  const heroShown = useAppSelector((s) => s.ui.heroShown);
  const view = useAppSelector((s) => s.ui.view);
  if (!heroShown || view !== 'planner') return null;

  return (
    <section className="mx-auto flex max-w-[1080px] flex-col gap-2 px-6 pt-3 pb-4">
      <span
        className="inline-block w-fit rounded-full px-[12px] py-1 text-[10.5px] font-semibold tracking-[0.18em] uppercase"
        style={{
          color: 'var(--accent)',
          background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
        }}
      >
        Celebration-first travel
      </span>
      <h1 className="m-0 font-serif text-[40px] leading-[1.05] font-medium tracking-[0.01em] text-white">
        Plan your perfect{' '}
        <span
          style={{
            background: 'linear-gradient(90deg, #e9c97f, #c5a059)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          celebration
        </span>{' '}
        trip
      </h1>
      <span className="text-[14px] text-white/65">
        Where, when, who and what — booked together in one go.
      </span>
    </section>
  );
}
