'use client';

import { useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import { useSubmitWeddingEnquiryMutation } from '@/store/elateApi';
import { WEDDING_GUEST_RANGES, WEDDING_SERVICES } from '@/data/wedding';
import { LabeledInput, LabeledSelect, LabeledTextarea } from '@/components/partner/fields';
import Chip from '@/components/ui/Chip';
import Icon from '@/components/ui/Icon';

const gridStyle = { gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))' };

interface Form {
  name: string;
  phone: string;
  email: string;
  preWeddingGuests: string;
  postWeddingGuests: string;
  weddingDate: string;
  preferredHotels: string;
  services: string[];
  notes: string;
}

type ReqKey = 'name' | 'phone' | 'weddingDate' | 'preWeddingGuests' | 'postWeddingGuests';

const toggle = (arr: string[], v: string) =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

/**
 * Wedding enquiry — the planner diverts here when "Wedding" is chosen. Captures
 * the lead, submits it to the API, then ends the journey with a thank-you.
 */
export default function WeddingEnquiry() {
  const dispatch = useAppDispatch();
  const { destQuery, start, end, celebDays } = useAppSelector((s) => s.plan);

  const [f, setF] = useState<Form>({
    name: '',
    phone: '',
    email: '',
    preWeddingGuests: '',
    postWeddingGuests: '',
    weddingDate: celebDays['wedding'] || '',
    preferredHotels: '',
    services: [],
    notes: '',
  });
  const [showErrors, setShowErrors] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [submitEnquiry, { isLoading, isError }] = useSubmitWeddingEnquiryMutation();

  const set = (k: keyof Form, v: string) => setF((s) => ({ ...s, [k]: v }));

  const missing = useMemo(() => {
    const m = new Set<ReqKey>();
    if (!f.name.trim()) m.add('name');
    if (!f.phone.trim()) m.add('phone');
    if (!f.weddingDate.trim()) m.add('weddingDate');
    if (!f.preWeddingGuests) m.add('preWeddingGuests');
    if (!f.postWeddingGuests) m.add('postWeddingGuests');
    return m;
  }, [f]);

  const err = (k: ReqKey, msg = 'Required') => (showErrors && missing.has(k) ? msg : undefined);

  const onSubmit = async () => {
    setShowErrors(true);
    if (missing.size > 0) return;
    try {
      const res = await submitEnquiry({
        contact: { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() },
        preWeddingGuests: f.preWeddingGuests,
        postWeddingGuests: f.postWeddingGuests,
        services: f.services,
        weddingDate: f.weddingDate,
        preferredHotels: f.preferredHotels.trim(),
        destination: destQuery,
        notes: f.notes.trim(),
      }).unwrap();
      setDone(res.referenceId);
    } catch {
      /* surfaced inline below */
    }
  };

  /* ---------- thank-you (flow ends here) ---------- */
  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-full text-[32px] text-white"
          style={{ background: 'var(--accent)' }}
        >
          <Icon name="ti-heart" />
        </span>
        <h2 className="text-primary m-0 font-serif text-2xl font-bold">
          Thanks for your time
        </h2>
        <p className="text-muted m-0 max-w-[44ch] text-[14.5px]">
          Our engagement manager will contact you soon.
        </p>
        <span
          className="rounded-full px-4 py-1.5 text-[13px] font-bold"
          style={{ background: 'color-mix(in srgb, var(--accent) 12%, #fff)', color: 'var(--accent-ink)' }}
        >
          Reference: {done}
        </span>
      </div>
    );
  }

  /* ---------- enquiry form ---------- */
  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={() => dispatch(setStep('plan'))}
        className="text-primary flex w-fit items-center gap-1.5 border-none bg-transparent p-0 text-[13px] font-bold"
      >
        <Icon name="arrow-left" size={16} /> Back to plan
      </button>

      <div className="flex flex-col gap-1">
        <h1 className="text-primary m-0 flex items-center gap-2 font-serif text-2xl font-bold">
          <Icon name="ti-rings" size={24} style={{ color: 'var(--accent-ink)' }} /> Wedding enquiry
        </h1>
        <p className="text-muted m-0 text-[13.5px]">
          Tell us about your celebration{destQuery ? ` in ${destQuery}` : ''}
          {start && end ? ` (${start} → ${end})` : ''} and our engagement manager will craft the
          full plan with you.
        </p>
      </div>

      {/* Guests */}
      <div className="flex flex-col gap-2">
        <span className="text-accent-ink text-[11px] font-black tracking-[0.06em] uppercase">
          Guests
        </span>
        <div className="grid gap-3" style={gridStyle}>
          <LabeledSelect
            label="Pre-wedding ceremonies (guests)"
            required
            value={f.preWeddingGuests}
            onChange={(v) => set('preWeddingGuests', v)}
            options={WEDDING_GUEST_RANGES}
            error={err('preWeddingGuests', 'Select a range')}
          />
          <LabeledSelect
            label="Post-wedding ceremonies (guests)"
            required
            value={f.postWeddingGuests}
            onChange={(v) => set('postWeddingGuests', v)}
            options={WEDDING_GUEST_RANGES}
            error={err('postWeddingGuests', 'Select a range')}
          />
        </div>
      </div>

      {/* Services */}
      <div className="flex flex-col gap-2">
        <span className="text-accent-ink text-[11px] font-black tracking-[0.06em] uppercase">
          Services you&apos;re looking for
        </span>
        <div className="flex flex-wrap gap-2">
          {WEDDING_SERVICES.map((s) => (
            <Chip
              key={s}
              active={f.services.includes(s)}
              onClick={() => setF((st) => ({ ...st, services: toggle(st.services, s) }))}
              rounded="99px"
            >
              {s}
            </Chip>
          ))}
        </div>
      </div>

      {/* Date, hotels & contact */}
      <div className="flex flex-col gap-2">
        <span className="text-accent-ink text-[11px] font-black tracking-[0.06em] uppercase">
          Date, hotels &amp; contact
        </span>
        <div className="grid gap-3" style={gridStyle}>
          <LabeledInput
            label="Wedding date"
            type="date"
            required
            value={f.weddingDate}
            onChange={(v) => set('weddingDate', v)}
            error={err('weddingDate')}
          />
          <LabeledInput
            label="Preferred hotels"
            value={f.preferredHotels}
            onChange={(v) => set('preferredHotels', v)}
            placeholder="Hotels you're considering"
          />
          <LabeledInput
            label="Your name"
            required
            value={f.name}
            onChange={(v) => set('name', v)}
            error={err('name')}
          />
          <LabeledInput
            label="Phone / WhatsApp"
            type="tel"
            required
            value={f.phone}
            onChange={(v) => set('phone', v)}
            placeholder="+91…"
            error={err('phone')}
          />
          <LabeledInput
            label="Email"
            type="email"
            value={f.email}
            onChange={(v) => set('email', v)}
          />
        </div>
        <LabeledTextarea
          label="Anything else we should know?"
          value={f.notes}
          onChange={(v) => set('notes', v)}
          placeholder="Theme, must-have rituals, rough budget, questions…"
        />
      </div>

      <div className="border-line flex flex-col gap-2 border-t pt-4">
        <Button
          variant="contained"
          color="primary"
          size="large"
          disabled={isLoading}
          onClick={onSubmit}
          sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 700 }}
        >
          {isLoading ? 'Submitting…' : 'Submit wedding enquiry'}
        </Button>
        {showErrors && missing.size > 0 && (
          <span className="text-muted text-[12.5px]">
            Please fill the fields marked <span className="text-[#d14343]">*</span>.
          </span>
        )}
        {isError && (
          <span className="text-[12.5px] font-semibold text-[#d14343]">
            Couldn&apos;t reach the server. Please ensure the backend is running and try again.
          </span>
        )}
      </div>
    </div>
  );
}
