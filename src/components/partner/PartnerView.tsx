'use client';

import { useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch } from '@/store/hooks';
import { setView } from '@/store/slices/uiSlice';
import { useSubmitPartnerEoiMutation, type PartnerEoi } from '@/store/elateApi';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import ServiceCard from './ServiceCard';
import { LabeledInput, LabeledSelect, LabeledTextarea, RadioChips } from './fields';
import {
  initialForm,
  missingRequired,
  progressPct,
  toPayload,
  type PartnerForm,
  type RequiredKey,
} from './formState';
import {
  SERVICES,
  CATEGORIES,
  SETUP_WINDOWS,
  YES_NO,
  SURPRISE_CAPABLE,
  UPDATE_METHODS,
  UPDATE_FREQ,
  LIVE_AVAILABILITY,
  RATE_MODELS,
  CONFIRM_SLA,
} from './data';

const asOpts = (arr: string[]) => arr.map((v) => ({ value: v, label: v }));

/** Section panel with a serif heading + hint, matching the planner cards. */
function Section({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-3.5 flex flex-col gap-1">
        <h2 className="text-primary m-0 font-serif text-[18px] font-bold">
          {n}. {title}
        </h2>
        <p className="text-muted m-0 text-[13px]">{hint}</p>
      </div>
      {children}
    </Card>
  );
}

const gridStyle = { gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))' };

/**
 * "Partner with us" — hotelier Expression of Interest form. Used both inside the
 * app shell and as the standalone `/partner` route; `onBack` overrides the
 * default "return to planner view" behaviour (e.g. to route home instead).
 */
export default function PartnerView({ onBack }: { onBack?: () => void } = {}) {
  const dispatch = useAppDispatch();
  const back = onBack ?? (() => dispatch(setView('planner')));
  const [f, setF] = useState<PartnerForm>(initialForm);
  const [showErrors, setShowErrors] = useState(false);
  const [result, setResult] = useState<PartnerEoi | null>(null);
  const [submitEoi, { isLoading, isError }] = useSubmitPartnerEoiMutation();

  const missing = useMemo(() => missingRequired(f), [f]);
  const pct = progressPct(f);
  const valid = missing.size === 0;

  const err = (k: RequiredKey, msg = 'Required') =>
    showErrors && missing.has(k) ? msg : undefined;

  const setProp = (k: keyof PartnerForm['property'], v: string) =>
    setF((s) => ({ ...s, property: { ...s.property, [k]: v } }));
  const setSurprise = (k: keyof PartnerForm['surprise'], v: string) =>
    setF((s) => ({ ...s, surprise: { ...s.surprise, [k]: v } }));
  const setInv = (k: keyof PartnerForm['inventory'], v: string) =>
    setF((s) => ({ ...s, inventory: { ...s.inventory, [k]: v } }));

  const onSubmit = async () => {
    setShowErrors(true);
    if (!valid) {
      document.getElementById('eoi-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    try {
      const res = await submitEoi(toPayload(f)).unwrap();
      setResult(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      /* error surfaced inline below the button */
    }
  };

  const reset = () => {
    setF(initialForm());
    setShowErrors(false);
    setResult(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ---------- success screen ---------- */
  if (result) {
    return (
      <div className="mx-auto flex max-w-[860px] flex-col gap-4 px-6 pt-4 pb-16">
        <Card>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full text-[28px] text-white"
              style={{ background: 'var(--accent)' }}
            >
              <Icon name="ti-check" />
            </span>
            <h2 className="text-primary m-0 font-serif text-2xl font-bold">Thank you!</h2>
            <p className="text-muted m-0 max-w-[46ch] text-[14px]">
              Your expression of interest has been recorded. Our partnerships team will reach out
              shortly.
            </p>
            <span
              className="rounded-full px-4 py-1.5 text-[13px] font-bold"
              style={{ background: 'color-mix(in srgb, var(--accent) 12%, #fff)', color: 'var(--accent-ink)' }}
            >
              Reference: {result.referenceId}
            </span>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Button variant="contained" color="primary" onClick={reset}>
                Submit another property
              </Button>
              <Button variant="outlined" color="primary" onClick={back}>
                Back to planner
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  /* ---------- form ---------- */
  return (
    <div id="eoi-form" className="mx-auto flex max-w-[860px] flex-col gap-4 px-6 pt-4 pb-16">
      <button
        type="button"
        onClick={back}
        className="text-primary flex w-fit items-center gap-1.5 border-none bg-transparent p-0 text-[13px] font-bold"
      >
        <Icon name="arrow-left" size={16} /> Back to planner
      </button>

      {/* Hero */}
      <div
        className="overflow-hidden rounded-[20px] p-6 text-white"
        style={{
          background: 'linear-gradient(120deg, var(--primary), var(--accent))',
          boxShadow: '0 20px 50px -26px rgba(28,60,143,.5)',
        }}
      >
        <h1 className="m-0 mb-1.5 font-serif text-[26px] font-bold">
          Become an ElateTrips celebration partner
        </h1>
        <p className="m-0 max-w-[62ch] text-[13.5px] opacity-95">
          ElateTrips helps travellers book celebration-led trips — stays paired with decor, gifts,
          experiences and on-ground services. Tell us what your property can offer and how you&apos;d
          like to keep room fares and availability up to date. Takes ~5 minutes.
        </p>
        <span className="mt-3 inline-block rounded-full bg-white/20 px-3 py-1 text-[12px]">
          Expression of Interest · No commitment
        </span>
      </div>

      {/* Progress */}
      <div className="flex flex-col gap-1.5">
        <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--sand)' }}>
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--primary), var(--accent))' }}
          />
        </div>
        <span className="text-muted text-[12px] font-semibold">{pct}% complete</span>
      </div>

      {/* 1. Property & contact */}
      <Section n={1} title="Property & contact" hint="Basic details so our partnerships team can reach you.">
        <div className="grid gap-3" style={gridStyle}>
          <LabeledInput
            label="Hotel / property name"
            required
            value={f.property.hotelName}
            onChange={(v) => setProp('hotelName', v)}
            error={err('hotelName')}
          />
          <LabeledInput
            label="City / destination"
            value={f.property.city}
            onChange={() => {}}
            readOnly
            hint="Currently launching in Ooty."
            style={{ background: 'var(--sand)', color: 'var(--muted)', cursor: 'not-allowed' }}
          />
          <LabeledSelect
            label="Property category"
            value={f.property.category}
            onChange={(v) => setProp('category', v)}
            options={CATEGORIES}
          />
          <LabeledInput
            label="Total number of rooms"
            type="number"
            inputMode="numeric"
            value={f.property.totalRooms}
            onChange={(v) => setProp('totalRooms', v)}
            placeholder="e.g. 48"
          />
          <LabeledInput
            label="Contact person"
            required
            value={f.property.contactName}
            onChange={(v) => setProp('contactName', v)}
            error={err('contactName')}
          />
          <LabeledInput
            label="Role / designation"
            value={f.property.role}
            onChange={(v) => setProp('role', v)}
            placeholder="e.g. GM, Sales Manager"
          />
          <LabeledInput
            label="Email"
            type="email"
            required
            value={f.property.email}
            onChange={(v) => setProp('email', v)}
            error={err('email', 'Enter a valid email')}
          />
          <LabeledInput
            label="Phone / WhatsApp"
            type="tel"
            required
            value={f.property.phone}
            onChange={(v) => setProp('phone', v)}
            placeholder="+91…"
            error={err('phone')}
          />
        </div>
      </Section>

      {/* 2. Services */}
      <Section
        n={2}
        title="Celebration services you can offer"
        hint="Tick the services you're interested in. For each, tell us how you'd fulfil it. You can do these in-house, through your own partners, or have ElateTrips source them."
      >
        <div className="flex flex-col gap-3">
          {SERVICES.map((def) => (
            <ServiceCard
              key={def.key}
              def={def}
              state={f.services[def.key]}
              onChange={(patch) =>
                setF((s) => ({
                  ...s,
                  services: { ...s.services, [def.key]: { ...s.services[def.key], ...patch } },
                }))
              }
            />
          ))}
        </div>
      </Section>

      {/* 3. Surprise capability */}
      <Section
        n={3}
        title="Surprise & setup capability"
        hint="Many bookings are surprises (birthdays, proposals). We need to know what your team can quietly execute."
      >
        <div className="flex flex-col gap-3">
          <RadioChips
            label="Can your team execute a surprise in-room setup before the guest arrives, kept hidden from the co-traveller?"
            required
            value={f.surprise.capable}
            onChange={(v) => setSurprise('capable', v)}
            options={asOpts(SURPRISE_CAPABLE)}
            error={err('capable', 'Please choose an option')}
          />
          <div className="grid gap-3" style={gridStyle}>
            <LabeledSelect
              label="Typical setup window you need before check-in"
              value={f.surprise.setupWindow}
              onChange={(v) => setSurprise('setupWindow', v)}
              options={SETUP_WINDOWS}
            />
            <LabeledSelect
              label="Can you share photo proof on setup completion?"
              value={f.surprise.photoProof}
              onChange={(v) => setSurprise('photoProof', v)}
              options={YES_NO}
            />
          </div>
        </div>
      </Section>

      {/* 4. Fares & availability */}
      <Section
        n={4}
        title="Room fares & availability — keeping it real-time"
        hint="This is key. Tell us how you'd like to keep rates and availability current so guests never see stale prices or overbook."
      >
        <div className="flex flex-col gap-3">
          <RadioChips
            label="Preferred way to update fares & availability"
            required
            column
            value={f.inventory.updateMethod}
            onChange={(v) => setInv('updateMethod', v)}
            options={UPDATE_METHODS}
            error={err('updateMethod', 'Please choose an update method')}
          />
          <div className="grid gap-3" style={gridStyle}>
            <LabeledInput
              label="Channel manager / PMS you use (if any)"
              value={f.inventory.channelManagerOrPMS}
              onChange={(v) => setInv('channelManagerOrPMS', v)}
              placeholder="e.g. STAAH, SiteMinder, eZee, Cloudbeds"
            />
            <LabeledSelect
              label="How often can you refresh rates & availability?"
              value={f.inventory.updateFrequency}
              onChange={(v) => setInv('updateFrequency', v)}
              options={UPDATE_FREQ}
            />
            <LabeledSelect
              label="Can you provide live availability (no manual reconfirm)?"
              value={f.inventory.liveAvailability}
              onChange={(v) => setInv('liveAvailability', v)}
              options={LIVE_AVAILABILITY}
            />
            <LabeledInput
              label="Rooms you'd allocate to ElateTrips"
              type="number"
              inputMode="numeric"
              value={f.inventory.roomsAllocated}
              onChange={(v) => setInv('roomsAllocated', v)}
              placeholder="e.g. 10"
            />
            <LabeledSelect
              label="Rate model"
              value={f.inventory.rateModel}
              onChange={(v) => setInv('rateModel', v)}
              options={RATE_MODELS}
            />
            <LabeledSelect
              label="Confirmation turnaround (request bookings)"
              value={f.inventory.confirmationSLA}
              onChange={(v) => setInv('confirmationSLA', v)}
              options={CONFIRM_SLA}
            />
          </div>
        </div>
      </Section>

      {/* 5. Wrap-up & consent */}
      <Section n={5} title="Anything else & consent" hint="Optional notes, then confirm and submit.">
        <div className="flex flex-col gap-3">
          <LabeledTextarea
            label="Anything else we should know?"
            value={f.notes}
            onChange={(v) => setF((s) => ({ ...s, notes: v }))}
            placeholder="Signature experiences, peak seasons, constraints, questions…"
          />
          <label className="flex cursor-pointer items-start gap-2.5 text-[13.5px]">
            <input
              type="checkbox"
              checked={f.consent}
              onChange={(e) => setF((s) => ({ ...s, consent: e.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            />
            <span className="text-ink">
              I agree to be contacted by ElateTrips about this expression of interest.{' '}
              <span className="text-[#d14343]">*</span>
            </span>
          </label>
          {err('consent', 'Please tick to continue') && (
            <span className="text-[11.5px] font-semibold text-[#d14343]">Please tick to continue</span>
          )}
        </div>
      </Section>

      <div className="flex flex-col gap-2">
        <Button
          variant="contained"
          color="primary"
          size="large"
          disabled={isLoading}
          onClick={onSubmit}
          sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 700 }}
        >
          {isLoading ? 'Submitting…' : 'Submit expression of interest'}
        </Button>
        <span className="text-[12.5px]" style={{ color: valid ? 'var(--accent-ink)' : 'var(--muted)' }}>
          {valid
            ? 'All mandatory fields are filled — you can submit.'
            : 'Fill the mandatory fields marked * to submit.'}
        </span>
        {isError && (
          <span className="text-[12.5px] font-semibold text-[#d14343]">
            Couldn&apos;t reach the server. Please ensure the backend is running and try again.
          </span>
        )}
      </div>
    </div>
  );
}
