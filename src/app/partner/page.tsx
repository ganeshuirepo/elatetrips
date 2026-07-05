'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@mui/material/Button';
import { useLazyGetPartnerEoiQuery } from '@/store/elateApi';
import { VENDOR_TEMPLATES, templateByType } from '@/components/partner/templates';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import { LabeledInput } from '@/components/partner/fields';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Partner chooser — every vendor track gets its own tailored onboarding form,
 * so the first step is picking who you are. Existing partners can jump back
 * into their submission (reference id + registered email) to update their
 * portfolio and details.
 */
export default function PartnerPage() {
  const router = useRouter();
  const [refId, setRefId] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState<{ ref?: boolean; email?: boolean }>({});
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState('');
  const [loadEoi, { isFetching }] = useLazyGetPartnerEoiQuery();

  const refError = !refId.trim() ? 'Enter your reference ID' : undefined;
  const emailError = !email.trim()
    ? 'Enter your registered email'
    : !EMAIL_RE.test(email.trim())
      ? 'Enter a valid email address'
      : undefined;

  const showRef = (attempted || touched.ref) && refError;
  const showEmail = (attempted || touched.email) && emailError;

  const openExisting = async () => {
    setAttempted(true);
    setServerError('');
    if (refError || emailError) return;
    try {
      const eoi = await loadEoi({ referenceId: refId.trim(), email: email.trim() }).unwrap();
      const slug = templateByType(eoi.partnerType)?.slug;
      if (slug) {
        const params = new URLSearchParams({ ref: eoi.referenceId, email: email.trim() });
        router.push(`/partner/${slug}?${params}`);
      }
    } catch (e) {
      const status = (e as { status?: number | string })?.status;
      setServerError(
        status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR'
          ? "Couldn't reach the server — please check your connection and try again."
          : "We couldn't find a submission for that reference ID and email. Check both and try again.",
      );
    }
  };

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6 px-4 pt-4 pb-16 sm:px-6">
      {/* Hero */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-black tracking-[0.18em] uppercase" style={{ color: 'var(--accent)' }}>
          Partner onboarding
        </span>
        <h1 className="m-0 font-serif text-[26px] leading-tight font-bold text-white sm:text-[30px]">
          Choose your partner track
        </h1>
        <p className="m-0 max-w-[64ch] text-[14px] leading-relaxed text-white/80">
          Every partner is different, so every track gets its own short form — only the questions
          that matter for your business. Zero listing fee; commission only on confirmed bookings.
        </p>
      </div>

      {/* Track cards */}
      <div className="et-auto-grid" style={{ '--et-col': '17rem' } as React.CSSProperties}>
        {VENDOR_TEMPLATES.map((t) => (
          <Link key={t.slug} href={`/partner/${t.slug}`} className="no-underline">
            <Card className="h-full transition-transform hover:-translate-y-0.5">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-[20px]"
                style={{ background: 'color-mix(in srgb, var(--accent) 16%, #fff)', color: 'var(--accent-ink)' }}
              >
                <Icon name={t.icon} />
              </span>
              <h2 className="text-primary mt-3 mb-1 font-serif text-[17.5px] font-bold">{t.label}</h2>
              <p className="text-muted m-0 mb-3 text-[13px] leading-relaxed">{t.tagline}</p>
              <span className="text-accent-ink text-[13px] font-bold">Start onboarding →</span>
            </Card>
          </Link>
        ))}
      </div>

      {/* Update an existing submission */}
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-primary m-0 font-serif text-[18px] font-bold">
              Already a partner? Update your portfolio
            </h2>
            <p className="text-muted m-0 text-[13px]">
              Enter the reference ID from your submission and the email you registered with —
              your saved answers load back into the form so you can update packages, rates and
              details anytime.
            </p>
          </div>
          <div
            className="grid items-start gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))' }}
          >
            <LabeledInput
              label="Reference ID"
              required
              value={refId}
              onChange={(v) => {
                setRefId(v);
                setServerError('');
              }}
              onBlur={() => setTouched((t) => ({ ...t, ref: true }))}
              placeholder="e.g. EOI-100042"
              error={showRef ? refError : undefined}
            />
            <LabeledInput
              label="Registered email"
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(v) => {
                setEmail(v);
                setServerError('');
              }}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="you@business.com"
              error={showEmail ? emailError : undefined}
            />
            <Button
              variant="contained"
              color="primary"
              disabled={isFetching}
              onClick={openExisting}
              sx={{ textTransform: 'none', fontWeight: 700, height: 44, mt: '21px' }}
            >
              {isFetching ? 'Loading…' : 'Load my details'}
            </Button>
          </div>
          {serverError && (
            <span
              role="alert"
              className="flex items-start gap-1.5 text-[12.5px] font-semibold text-[#d14343]"
            >
              <Icon name="alert-circle" size={15} className="mt-[1px] flex-none" />
              {serverError}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
