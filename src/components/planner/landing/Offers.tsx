'use client';

import Icon from '@/components/ui/Icon';

const OFFERS: { code?: string; icon: string; title: string; text: string; grad: string }[] = [
  {
    code: 'DEALNOW',
    icon: 'discount-2',
    title: '10% instant off',
    text: 'Apply DEALNOW at checkout for 10% off your order, up to ₹500.',
    grad: 'linear-gradient(135deg,#1f4a44,#c9a45a)',
  },
  {
    icon: 'cake',
    title: 'Free celebration setup',
    text: 'Complimentary balloon & decor setup on stays of 3 nights or more.',
    grad: 'linear-gradient(135deg,#4a3f2f,#d4a94f)',
  },
  {
    icon: 'calendar-heart',
    title: 'Early planner perk',
    text: 'Book 30+ days ahead and lock today’s rates on hotels and cabs.',
    grad: 'linear-gradient(135deg,#143a3c,#9c7c33)',
  },
];

/** Pre-search landing: current offers, shown before the storefront opens. */
export default function Offers() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
          Offers &amp; deals
        </span>
        <p className="m-0 text-[13.5px] text-white/60">
          A few ways to save on your celebration trip.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {OFFERS.map((o) => (
          <div
            key={o.title}
            className="relative flex flex-col gap-2 overflow-hidden rounded-[16px] p-4 text-white"
            style={{ background: o.grad }}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-white/20 text-[20px]">
              <Icon name={o.icon} />
            </span>
            <span className="text-[15px] font-extrabold">{o.title}</span>
            <span className="text-[12.5px] leading-snug text-white/85">{o.text}</span>
            {o.code && (
              <span className="mt-1 w-fit rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-black tracking-[0.05em] text-[#08201F]">
                CODE · {o.code}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
