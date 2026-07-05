'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Button from '@mui/material/Button';
import {
  useSubmitPartnerEoiMutation,
  useUpdatePartnerEoiMutation,
  type PortfolioItem,
  type VendorEoi,
  type VendorEoiBody,
} from '@/store/elateApi';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import { LabeledInput, LabeledSelect, LabeledTextarea, MultiChips, RadioChips } from './fields';
import PortfolioEditor from './PortfolioEditor';
import type { FieldDef, SectionDef, VendorTemplate } from './templates';

type Values = Record<string, string | string[]>;

/** Business keys lifted out of the form values into the payload's `business`. */
const BUSINESS_KEYS = ['businessName', 'city', 'contactName', 'role', 'email', 'phone'] as const;

/** Answers for the "documents ready" chips live under this details key. */
const DOCUMENTS_KEY = 'documentsReady';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const gridStyle = { gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))' };

/** Compact fields share a responsive grid row; choice/textarea fields go full-width. */
const isCompact = (f: FieldDef) => ['text', 'email', 'tel', 'number', 'select'].includes(f.type);

function allFields(template: VendorTemplate): FieldDef[] {
  return [template.business, ...template.sections].flatMap((s) => s.fields);
}

function initialValues(template: VendorTemplate, existing?: VendorEoi): Values {
  const values: Values = {};
  for (const f of allFields(template)) values[f.key] = f.type === 'chips' ? [] : '';
  values.city = 'Ooty';
  values[DOCUMENTS_KEY] = [];
  if (existing) {
    for (const k of BUSINESS_KEYS) values[k] = existing.business[k] ?? '';
    for (const [k, v] of Object.entries(existing.details)) values[k] = v;
  }
  return values;
}

const isEmpty = (v: string | string[] | undefined) =>
  v === undefined || (Array.isArray(v) ? v.length === 0 : !v.trim());

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

/**
 * Generic onboarding form — renders any vendor template: business & contact,
 * track-specific capability sections, the documents-ready checklist, and the
 * editable portfolio. With `existing` it becomes the "update your portfolio"
 * editor for a previously submitted EOI (`ownerEmail` proves ownership).
 */
export default function VendorForm({
  template,
  existing,
  ownerEmail,
}: {
  template: VendorTemplate;
  existing?: VendorEoi;
  ownerEmail?: string;
}) {
  const [values, setValues] = useState<Values>(() => initialValues(template, existing));
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(existing?.portfolio ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [consent, setConsent] = useState(Boolean(existing));
  const [showErrors, setShowErrors] = useState(false);
  const [result, setResult] = useState<VendorEoi | null>(null);
  const [submitEoi, submitState] = useSubmitPartnerEoiMutation();
  const [updateEoi, updateState] = useUpdatePartnerEoiMutation();
  const { isLoading, isError } = existing ? updateState : submitState;

  const set = (key: string, v: string | string[]) => setValues((s) => ({ ...s, [key]: v }));

  const requiredFields = useMemo(() => allFields(template).filter((f) => f.required), [template]);

  const missing = useMemo(() => {
    const miss = new Set<string>();
    for (const f of requiredFields) {
      const v = values[f.key];
      if (isEmpty(v)) miss.add(f.key);
      else if (f.type === 'email' && !EMAIL_RE.test((v as string).trim())) miss.add(f.key);
    }
    if (!consent) miss.add('consent');
    return miss;
  }, [requiredFields, values, consent]);

  const requiredTotal = requiredFields.length + 1; // + consent
  const pct = Math.round(((requiredTotal - missing.size) / requiredTotal) * 100);
  const valid = missing.size === 0;

  const err = (f: FieldDef) => {
    if (!showErrors || !missing.has(f.key)) return undefined;
    if (f.type === 'email') return 'Enter a valid email';
    return f.type === 'radio' || f.type === 'chips' ? 'Please choose an option' : 'Required';
  };

  const toPayload = (): VendorEoiBody => {
    const str = (k: string) => ((values[k] as string) ?? '').trim();
    const business: VendorEoiBody['business'] = {
      businessName: str('businessName'),
      city: str('city'),
      // Solo tracks (local guides) have no separate contact person field.
      contactName: str('contactName') || str('businessName'),
      role: str('role'),
      email: str('email'),
      phone: str('phone'),
    };
    const details: Values = {};
    for (const [k, v] of Object.entries(values)) {
      if (!(BUSINESS_KEYS as readonly string[]).includes(k)) {
        details[k] = Array.isArray(v) ? v : v.trim();
      }
    }
    return {
      partnerType: template.type,
      business,
      details,
      portfolio: portfolio
        .filter((p) => p.name.trim())
        .map((p) => ({
          name: p.name.trim(),
          description: p.description.trim(),
          priceRange: p.priceRange.trim(),
          link: p.link.trim(),
        })),
      notes: notes.trim(),
      consent: true,
    };
  };

  const onSubmit = async () => {
    setShowErrors(true);
    if (!valid) {
      document.getElementById('eoi-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    try {
      const res = existing
        ? await updateEoi({
            referenceId: existing.referenceId,
            email: ownerEmail ?? existing.business.email,
            body: toPayload(),
          }).unwrap()
        : await submitEoi(toPayload()).unwrap();
      setResult(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      /* error surfaced inline below the button */
    }
  };

  const renderField = (f: FieldDef) => {
    const v = values[f.key];
    switch (f.type) {
      case 'select':
        return (
          <LabeledSelect
            key={f.key}
            label={f.label}
            required={f.required}
            value={(v as string) ?? ''}
            onChange={(nv) => set(f.key, nv)}
            options={f.options ?? []}
            error={err(f)}
          />
        );
      case 'radio':
        return (
          <RadioChips
            key={f.key}
            label={f.label}
            required={f.required}
            column={f.column}
            value={(v as string) ?? ''}
            onChange={(nv) => set(f.key, nv)}
            options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
            error={err(f)}
          />
        );
      case 'chips':
        return (
          <MultiChips
            key={f.key}
            label={f.label}
            required={f.required}
            hint={f.hint}
            value={(v as string[]) ?? []}
            onChange={(nv) => set(f.key, nv)}
            options={f.options ?? []}
            error={err(f)}
          />
        );
      case 'textarea':
        return (
          <LabeledTextarea
            key={f.key}
            label={f.label}
            value={(v as string) ?? ''}
            onChange={(nv) => set(f.key, nv)}
            placeholder={f.placeholder}
          />
        );
      default:
        return (
          <LabeledInput
            key={f.key}
            label={f.label}
            required={f.required}
            type={f.type === 'text' ? undefined : f.type}
            inputMode={f.type === 'number' ? 'numeric' : undefined}
            value={(v as string) ?? ''}
            onChange={(nv) => set(f.key, nv)}
            placeholder={f.placeholder}
            hint={f.hint}
            readOnly={f.readOnly}
            style={
              f.readOnly
                ? { background: 'var(--sand)', color: 'var(--muted)', cursor: 'not-allowed' }
                : undefined
            }
            error={err(f)}
          />
        );
    }
  };

  /** Consecutive compact fields share a grid row; wide fields break the flow. */
  const renderSection = (s: SectionDef) => {
    const blocks: React.ReactNode[] = [];
    let run: FieldDef[] = [];
    const flush = () => {
      if (run.length) {
        blocks.push(
          <div key={`grid-${run[0].key}`} className="grid gap-3" style={gridStyle}>
            {run.map(renderField)}
          </div>,
        );
        run = [];
      }
    };
    for (const f of s.fields) {
      if (isCompact(f)) run.push(f);
      else {
        flush();
        blocks.push(renderField(f));
      }
    }
    flush();
    return <div className="flex flex-col gap-3">{blocks}</div>;
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
            <h2 className="text-primary m-0 font-serif text-2xl font-bold">
              {existing ? 'Your details are updated' : 'Thank you!'}
            </h2>
            <p className="text-muted m-0 max-w-[48ch] text-[14px]">
              {existing
                ? 'Your portfolio and details have been saved. Our partnerships team sees the changes immediately.'
                : 'Your expression of interest has been recorded. Our partnerships team will reach out shortly.'}
            </p>
            <span
              className="rounded-full px-4 py-1.5 text-[13px] font-bold"
              style={{ background: 'color-mix(in srgb, var(--accent) 12%, #fff)', color: 'var(--accent-ink)' }}
            >
              Reference: {result.referenceId}
            </span>
            {!existing && (
              <p className="text-muted m-0 max-w-[48ch] text-[12.5px]">
                Save this reference ID — together with your email it lets you update your
                portfolio and details anytime from the partner page.
              </p>
            )}
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Button component={Link} href="/partner" variant="contained" color="primary">
                All partner tracks
              </Button>
              <Button component={Link} href="/" variant="outlined" color="primary">
                Back to ElateTrips
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  /* ---------- form ---------- */
  const sectionCards = [template.business, ...template.sections];
  let n = 0;

  return (
    <div id="eoi-form" className="mx-auto flex max-w-[860px] flex-col gap-4 px-6 pt-4 pb-16">
      <Link
        href="/partner"
        className="text-primary flex w-fit items-center gap-1.5 text-[13px] font-bold no-underline"
      >
        <Icon name="arrow-left" size={16} /> All partner tracks
      </Link>

      {/* Hero */}
      <div
        className="overflow-hidden rounded-[20px] p-6 text-white"
        style={{
          background: 'linear-gradient(120deg, var(--primary), var(--accent))',
          boxShadow: '0 20px 50px -26px rgba(28,60,143,.5)',
        }}
      >
        <span className="mb-2 inline-flex items-center gap-2 text-[12px] font-bold tracking-[0.14em] uppercase opacity-90">
          <Icon name={template.icon} size={16} /> {template.label}
        </span>
        <h1 className="m-0 mb-1.5 font-serif text-[26px] font-bold">
          {existing ? `Update your details — ${existing.referenceId}` : template.heroTitle}
        </h1>
        <p className="m-0 max-w-[62ch] text-[13.5px] opacity-95">{template.heroBody}</p>
        <span className="mt-3 inline-block rounded-full bg-white/20 px-3 py-1 text-[12px]">
          {existing
            ? 'Your saved answers are loaded — change anything and save.'
            : 'Expression of Interest · No commitment · Takes ~5 minutes'}
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

      {sectionCards.map((s) => (
        <Section key={s.key} n={++n} title={s.title} hint={s.hint}>
          {renderSection(s)}
        </Section>
      ))}

      {/* Documents ready */}
      <Section
        n={++n}
        title="Documents you have ready"
        hint={template.documents.hint}
      >
        <MultiChips
          label="Tick what you can share today — the rest can follow during onboarding."
          value={(values[DOCUMENTS_KEY] as string[]) ?? []}
          onChange={(v) => set(DOCUMENTS_KEY, v)}
          options={template.documents.options}
        />
      </Section>

      {/* Portfolio */}
      <Section n={++n} title={template.portfolio.title} hint={template.portfolio.hint}>
        <PortfolioEditor config={template.portfolio} items={portfolio} onChange={setPortfolio} />
      </Section>

      {/* Wrap-up & consent */}
      <Section n={++n} title="Anything else & consent" hint="Optional notes, then confirm and submit.">
        <div className="flex flex-col gap-3">
          <LabeledTextarea
            label="Anything else we should know?"
            value={notes}
            onChange={setNotes}
            placeholder="Signature offerings, peak seasons, constraints, questions…"
          />
          <label className="flex cursor-pointer items-start gap-2.5 text-[13.5px]">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            />
            <span className="text-ink">
              I agree to be contacted by ElateTrips about this expression of interest.{' '}
              <span className="text-[#d14343]">*</span>
            </span>
          </label>
          {showErrors && missing.has('consent') && (
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
          {isLoading
            ? existing
              ? 'Saving…'
              : 'Submitting…'
            : existing
              ? 'Save my updates'
              : 'Submit expression of interest'}
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
