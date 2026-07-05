'use client';

import Link from 'next/link';
import Button from '@mui/material/Button';
import { useAppDispatch } from '@/store/hooks';
import { setView } from '@/store/slices/uiSlice';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

/** Benefit cards — from the partner pitch. */
const BENEFITS = [
  {
    icon: 'ti-confetti',
    title: 'Customers ready to book',
    body: 'You reach people actively planning a celebration — warm, in-the-moment demand, not cold leads.',
  },
  {
    icon: 'ti-wallet',
    title: 'No upfront cost',
    body: 'No listing or subscription fee. We earn a small commission only on confirmed bookings.',
  },
  {
    icon: 'ti-adjustments',
    title: 'You stay in control',
    body: 'Set your own packages, pricing and availability. We send the customer; you deliver.',
  },
  {
    icon: 'ti-world',
    title: 'Reach beyond your city',
    body: 'Get discovered by travellers planning trips and celebrations in your area.',
  },
];

import { VENDOR_TEMPLATES } from './templates';

const HOW_IT_WORKS = [
  {
    title: 'Onboard in minutes',
    body: 'Share your details, catalogue and rates — no tech work on your side.',
  },
  {
    title: 'Get featured',
    body: 'We show you to customers planning the exact occasion in your area.',
  },
  {
    title: 'Receive bookings',
    body: 'Confirmed orders come to you. We handle the customer and the payment.',
  },
];

/** The 30-day runway — from the hotels & curated stays onboarding playbook. */
const RUNWAY = [
  {
    days: 'Days 0–2',
    title: 'Connect',
    body: 'Intro call or visit. We walk through the model — zero listing fee, commission only on confirmed bookings — and capture your details.',
  },
  {
    days: 'Days 3–7',
    title: 'Verify & sign',
    body: 'Document check plus a short site visit. Digital agreement — no paperwork chase.',
  },
  {
    days: 'Days 7–14',
    title: 'Build the listing',
    body: 'Rooms, photos, rates and 2–3 celebration packages go up — our merchandising team does the heavy lifting.',
  },
  {
    days: 'Days 14–21',
    title: 'Train & dry-run',
    body: 'Partner app training, occasion playbooks, Surprise Mode protocol — then one test order, end to end.',
  },
  {
    days: 'Days 21–30',
    title: 'Go live',
    body: 'Listing goes live, featured in the new-partner cohort. Partner Success personally shepherds your first booking.',
  },
];

const COMMERCIALS = [
  'Zero listing or subscription fee — ever',
  'Commission only on confirmed bookings, agreed at signing',
  'Payouts on a fixed weekly cycle after service completion',
  'You control pricing, packages and availability',
  'No exclusivity, no lock-in — leave anytime',
];

/** Small gold eyebrow + light serif heading, drawn directly on the dark canvas. */
function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-black tracking-[0.18em] uppercase" style={{ color: 'var(--accent)' }}>
        {eyebrow}
      </span>
      <h2 className="m-0 font-serif text-[22px] font-bold text-white">{title}</h2>
    </div>
  );
}

/**
 * "Partner with us" — the benefits pitch shown from the header menu. Sells the
 * partnership (why, who, how, commercials) and routes to the standalone
 * `/partner` onboarding form to express interest.
 */
export default function PartnerBenefits() {
  const dispatch = useAppDispatch();

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-8 px-6 pt-4 pb-16">
      <button
        type="button"
        onClick={() => dispatch(setView('planner'))}
        className="flex w-fit cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-[13px] font-bold text-white/80 hover:text-white"
      >
        <Icon name="arrow-left" size={16} /> Back to planner
      </button>

      {/* Hero — light text directly on the canvas */}
      <div className="flex flex-col gap-4">
        <span className="text-[11px] font-black tracking-[0.18em] uppercase" style={{ color: 'var(--accent)' }}>
          India&apos;s celebration-first travel platform
        </span>
        <h1 className="m-0 max-w-[22ch] font-serif text-[34px] leading-tight font-bold text-white">
          Turn celebrations into your highest-value bookings
        </h1>
        <p className="m-0 max-w-[64ch] text-[14.5px] leading-relaxed text-white/80">
          ElateTrips lets people plan their trip and their celebration — weddings, birthdays,
          anniversaries — in one place: stays, transport, décor, experiences and gifting. We
          connect partners like you to customers at the exact moment they are planning and ready
          to book.
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <Button
            component={Link}
            href="/partner"
            variant="contained"
            color="primary"
            size="large"
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Become a partner
          </Button>
          <a
            href="mailto:partners@elatetrips.com"
            className="text-[13.5px] font-semibold text-white/75 no-underline hover:text-white"
          >
            <Icon name="mail" size={15} className="mr-1.5 align-[-2px]" />
            partners@elatetrips.com
          </a>
        </div>
      </div>

      {/* Why partner */}
      <section className="flex flex-col gap-4">
        <SectionHeading eyebrow="Why partner with ElateTrips" title="What you get from day one" />
        <div className="et-auto-grid" style={{ '--et-col': '14rem' } as React.CSSProperties}>
          {BENEFITS.map((b) => (
            <Card key={b.title}>
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-[20px]"
                style={{ background: 'color-mix(in srgb, var(--accent) 16%, #fff)', color: 'var(--accent-ink)' }}
              >
                <Icon name={b.icon} />
              </span>
              <h3 className="text-primary mt-3 mb-1 font-serif text-[16.5px] font-bold">{b.title}</h3>
              <p className="text-muted m-0 text-[13px] leading-relaxed">{b.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Who we partner with */}
      <section className="flex flex-col gap-4">
        <SectionHeading eyebrow="Who we partner with" title="Every hand a celebration needs" />
        <div className="flex flex-wrap gap-2">
          {VENDOR_TEMPLATES.map((t) => (
            <Link
              key={t.slug}
              href={`/partner/${t.slug}`}
              className="flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] font-semibold text-white/85 no-underline transition-colors hover:text-white"
              style={{ borderColor: 'color-mix(in srgb, var(--accent) 35%, transparent)', background: 'color-mix(in srgb, #ffffff 6%, transparent)' }}
            >
              <Icon name={t.icon} size={15} /> {t.label}
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="flex flex-col gap-4">
        <SectionHeading eyebrow="How it works" title="Three steps to your first booking" />
        <div className="et-auto-grid" style={{ '--et-col': '14rem' } as React.CSSProperties}>
          {HOW_IT_WORKS.map((s, i) => (
            <Card key={s.title}>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-black text-white"
                style={{ background: 'var(--accent-ink)' }}
              >
                {i + 1}
              </span>
              <h3 className="text-primary mt-3 mb-1 font-serif text-[16.5px] font-bold">{s.title}</h3>
              <p className="text-muted m-0 text-[13px] leading-relaxed">{s.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Onboarding runway */}
      <section className="flex flex-col gap-4">
        <SectionHeading eyebrow="The 30-day runway" title="Onboarding journey — Day 0 to Day 30" />
        <Card>
          <ol className="m-0 flex list-none flex-col p-0">
            {RUNWAY.map((step, i) => (
              <li
                key={step.title}
                className={`flex gap-4 py-3.5 ${i > 0 ? 'border-line border-t' : ''}`}
              >
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-black text-white"
                  style={{ background: 'var(--accent-ink)' }}
                >
                  {i + 1}
                </span>
                <div className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2.5">
                    <h3 className="text-primary m-0 font-serif text-[15.5px] font-bold">{step.title}</h3>
                    <span className="text-accent-ink text-[11.5px] font-bold tracking-wide uppercase">
                      {step.days}
                    </span>
                  </div>
                  <p className="text-muted m-0 text-[13px] leading-relaxed">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-ink border-line m-0 border-t pt-3.5 text-[13px] font-semibold">
            Our commitment: a single onboarding owner from ElateTrips end-to-end — you never repeat
            your story twice.{' '}
            <Link href="/partner" className="text-accent-ink font-bold">
              Start onboarding →
            </Link>
          </p>
        </Card>
      </section>

      {/* Commercials */}
      <section className="flex flex-col gap-4">
        <SectionHeading eyebrow="Simple commercials" title="We only earn when you earn" />
        <Card>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {COMMERCIALS.map((c) => (
              <li key={c} className="text-ink flex items-start gap-2.5 text-[13.5px]">
                <Icon
                  name="ti-check"
                  size={17}
                  className="mt-0.5 shrink-0"
                  style={{ color: 'var(--accent-ink)' }}
                />
                {c}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* Final CTA */}
      <div className="flex flex-col items-start gap-3">
        <h2 className="m-0 font-serif text-[24px] font-bold text-white">
          Let&apos;s get your business more celebration bookings.
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            component={Link}
            href="/partner"
            variant="contained"
            color="primary"
            size="large"
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Start onboarding — it takes ~5 minutes
          </Button>
          <span className="text-[13px] text-white/70">Expression of interest · No commitment</span>
        </div>
      </div>
    </div>
  );
}
