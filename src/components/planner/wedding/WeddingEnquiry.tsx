'use client';

import { useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import { useSubmitWeddingEnquiryMutation } from '@/store/elateApi';
import {
  WEDDING_GUEST_RANGES,
  WEDDING_SERVICES,
  PRE_CEREMONIES,
  POST_CEREMONIES,
} from '@/data/wedding';
import { LabeledInput, LabeledSelect, LabeledTextarea } from '@/components/partner/fields';
import Chip from '@/components/ui/Chip';
import Icon from '@/components/ui/Icon';

const gridStyle = { gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))' };

interface Form {
  name: string;
  phone: string;
  email: string;
  weddingGuests: string;
  weddingDate: string;
  preferredHotels: string;
  services: string[];
  notes: string;
  /** ceremony type → date. Presence of the key means the ceremony is selected. */
  pre: Record<string, string>;
  post: Record<string, string>;
}

type ReqKey = 'name' | 'phone' | 'weddingDate' | 'weddingGuests';

const toggle = (arr: string[], v: string) =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

const SECTION = 'text-accent-ink text-[11px] font-black tracking-[0.06em] uppercase';

/** A ceremony group: pick types, then give each a date. */
function CeremonyPicker({
  title,
  options,
  value,
  onToggle,
  onDate,
}: {
  title: string;
  options: string[];
  value: Record<string, string>;
  onToggle: (type: string) => void;
  onDate: (type: string, date: string) => void;
}) {
  const selected = Object.keys(value);
  return (
    <div className="flex flex-col gap-2">
      <span className={SECTION}>{title}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o} active={o in value} onClick={() => onToggle(o)} rounded="99px">
            {o}
          </Chip>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="grid gap-3 pt-1" style={gridStyle}>
          {selected.map((type) => (
            <LabeledInput
              key={type}
              label={`${type} — date`}
              type="date"
              value={value[type]}
              onChange={(v) => onDate(type, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
    weddingGuests: '',
    weddingDate: celebDays['wedding'] || '',
    preferredHotels: '',
    services: [],
    notes: '',
    pre: {},
    post: {},
  });
  const [showErrors, setShowErrors] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [submitEnquiry, { isLoading, isError }] = useSubmitWeddingEnquiryMutation();

  const set = (k: keyof Form, v: string) => setF((s) => ({ ...s, [k]: v }));

  const toggleCeremony = (group: 'pre' | 'post', type: string) =>
    setF((s) => {
      const next = { ...s[group] };
      if (type in next) delete next[type];
      else next[type] = '';
      return { ...s, [group]: next };
    });
  const setCeremonyDate = (group: 'pre' | 'post', type: string, date: string) =>
    setF((s) => ({ ...s, [group]: { ...s[group], [type]: date } }));

  const missing = useMemo(() => {
    const m = new Set<ReqKey>();
    if (!f.name.trim()) m.add('name');
    if (!f.phone.trim()) m.add('phone');
    if (!f.weddingDate.trim()) m.add('weddingDate');
    if (!f.weddingGuests) m.add('weddingGuests');
    return m;
  }, [f]);

  const err = (k: ReqKey, msg = 'Required') => (showErrors && missing.has(k) ? msg : undefined);

  const onSubmit = async () => {
    setShowErrors(true);
    if (missing.size > 0) return;
    const toList = (m: Record<string, string>) =>
      Object.entries(m).map(([type, date]) => ({ type, date }));
    try {
      const res = await submitEnquiry({
        contact: { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() },
        weddingGuests: f.weddingGuests,
        preCeremonies: toList(f.pre),
        postCeremonies: toList(f.post),
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
        <h2 className="text-primary m-0 font-serif text-2xl font-bold">Thanks for your time</h2>
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

      {/* Wedding — date + guest count (guests required only for the wedding) */}
      <div className="flex flex-col gap-2">
        <span className={SECTION}>The wedding</span>
        <div className="grid gap-3" style={gridStyle}>
          <LabeledInput
            label="Wedding date"
            type="date"
            required
            value={f.weddingDate}
            onChange={(v) => set('weddingDate', v)}
            error={err('weddingDate')}
          />
          <LabeledSelect
            label="Number of guests (wedding)"
            required
            value={f.weddingGuests}
            onChange={(v) => set('weddingGuests', v)}
            options={WEDDING_GUEST_RANGES}
            error={err('weddingGuests', 'Select a range')}
          />
        </div>
      </div>

      {/* Pre / post ceremonies — type + date */}
      <CeremonyPicker
        title="Pre-wedding ceremonies"
        options={PRE_CEREMONIES}
        value={f.pre}
        onToggle={(t) => toggleCeremony('pre', t)}
        onDate={(t, d) => setCeremonyDate('pre', t, d)}
      />
      <CeremonyPicker
        title="Post-wedding ceremonies"
        options={POST_CEREMONIES}
        value={f.post}
        onToggle={(t) => toggleCeremony('post', t)}
        onDate={(t, d) => setCeremonyDate('post', t, d)}
      />

      {/* Services */}
      <div className="flex flex-col gap-2">
        <span className={SECTION}>Services you&apos;re looking for</span>
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

      {/* Hotels & contact */}
      <div className="flex flex-col gap-2">
        <span className={SECTION}>Preferred hotels &amp; contact</span>
        <div className="grid gap-3" style={gridStyle}>
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
