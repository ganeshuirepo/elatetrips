'use client';

import Icon from '@/components/ui/Icon';

const FEATURES: { icon: string; title: string; text: string }[] = [
  {
    icon: 'confetti',
    title: 'Celebration-first travel',
    text: 'Birthdays, anniversaries, honeymoons and escapes — every trip is built around your moment, not just a booking.',
  },
  {
    icon: 'shopping-cart',
    title: 'Everything in one cart',
    text: 'Stays, cabs, celebration services, on-ground crews and surprise gifts — pick any, combine freely, check out once.',
  },
  {
    icon: 'map-search',
    title: 'A local guide, included',
    text: 'Every trip comes with a dedicated guide who plans your itinerary and coordinates hotels, events and partners.',
  },
  {
    icon: 'sparkles',
    title: 'Handpicked in Ooty',
    text: 'Curated stays, sightseeing and experiences across the Nilgiris — with more destinations on the way.',
  },
];

/** Pre-search landing: what ElateTrips is, shown before the storefront opens. */
export default function AboutElate() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
          About ElateTrips
        </span>
        <h2 className="m-0 font-serif text-[22px] font-bold text-white">
          Celebrations, stays &amp; everything around them — planned as one.
        </h2>
        <p className="m-0 max-w-[46rem] text-[13.5px] text-white/60">
          Search your trip above to unlock hotels, cabs, celebrations, gifts and more — all sharing
          a single cart and a single checkout.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="flex items-start gap-3 rounded-[16px] border border-white/12 bg-white/[0.04] p-4"
          >
            <span
              className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] text-[22px]"
              style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)' }}
            >
              <Icon name={f.icon} />
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-[14.5px] font-extrabold text-white">{f.title}</span>
              <span className="text-[12.5px] leading-snug text-white/60">{f.text}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
