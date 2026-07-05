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
import PortfolioEditor, { portfolioItemInvalid } from './PortfolioEditor';
import type { FieldDef, SectionDef, VendorTemplate } from './templates';

type Values = Record<string, string | string[]>;

/** Business keys lifted out of the form values into the payload's `business`. */
const BUSINESS_KEYS = ['businessName', 'city', 'contactName', 'role', 'email', 'phone'] as const;

/** Answers for the "documents ready" chips live under this details key. */
const DOCUMENTS_KEY = 'documentsReady';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 6–18 digits, optional +country code, spaces/dashes allowed (matches backend's 6–20 chars).
const PHONE_RE = /^\+?[0-9][0-9\s-]{4,17}[0-9]$/;

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

/**
 * Validation message for one field, or undefined when it's fine. Required
 * fields must be filled; filled fields must also pass their format check
 * (email, phone, positive number) even when optional.
 */
function fieldError(f: FieldDef, v: string | string[] | undefined): string | undefined {
  if (f.required && isEmpty(v)) {
    if (f.type === 'chips') return 'Pick at least one option';
    if (f.type === 'radio' || f.type === 'select') return 'Please choose an option';
    return 'This field is required';
  }
  if (v === undefined || Array.isArray(v) || isEmpty(v)) return undefined;
  const s = v.trim();
  if (f.type === 'email' && !EMAIL_RE.test(s)) return 'Enter a valid email address';
  if (f.type === 'tel' && !PHONE_RE.test(s)) return 'Enter a valid phone number, e.g. +91 98765 43210';
  if (f.type === 'number' && (!/^\d+$/.test(s) || Number(s) <= 0)) return 'Enter a whole number';
  return undefined;
}

/** Section panel with a serif heading + hint, matching the planner cards. */
function Section({
  n,
  title,
  hint,
  errorCount = 0,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  /** Invalid fields inside — shown as a badge once errors are revealed. */
  errorCount?: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-3.5 flex flex-col gap-1">
        <h2 className="text-primary m-0 flex flex-wrap items-center gap-2 font-serif text-[17px] font-bold sm:text-[18px]">
          {n}. {title}
          {errorCount > 0 && (
            <span className="rounded-full bg-[#FDECEC] px-2 py-0.5 text-[11px] font-bold text-[#B3261E]">
              {errorCount} to fix
            </span>
          )}
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
 *
 * Validation: required fields are marked *, format checks run on email /
 * phone / number fields; each field validates when you leave it, and Submit
 * reveals everything, counts the problems in a notification bar and scrolls
 * the first invalid field into view.
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
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [result, setResult] = useState<VendorEoi | null>(null);
  const [submitEoi, submitState] = useSubmitPartnerEoiMutation();
  const [updateEoi, updateState] = useUpdatePartnerEoiMutation();
  const { isLoading, isError } = existing ? updateState : submitState;

  const set = (key: string, v: string | string[]) => setValues((s) => ({ ...s, [key]: v }));
  const touch = (key: string) => setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));

  const fields = useMemo(() => allFields(template), [template]);
  const requiredFields = useMemo(() => fields.filter((f) => f.required), [fields]);

  /** Every field's current problem (required + format), keyed by field key. */
  const errors = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fields) {
      const e = fieldError(f, values[f.key]);
      if (e) map.set(f.key, e);
    }
    return map;
  }, [fields, values]);

  /** Portfolio entries with content but no name would be dropped — flag them. */
  const badPortfolio = useMemo(() => portfolio.filter(portfolioItemInvalid).length, [portfolio]);

  const problemCount = errors.size + badPortfolio + (consent ? 0 : 1);
  const valid = problemCount === 0;

  // Progress tracks the mandatory items only (required fields + consent).
  const requiredTotal = requiredFields.length + 1;
  const requiredDone =
    requiredFields.filter((f) => !errors.has(f.key)).length + (consent ? 1 : 0);
  const pct = Math.round((requiredDone / requiredTotal) * 100);

  /** A field shows its error once it was visited — or after a submit attempt. */
  const err = (f: FieldDef) =>
    showErrors || touched.has(f.key) ? errors.get(f.key) : undefined;

  const sectionErrorCount = (s: SectionDef) =>
    showErrors ? s.fields.filter((f) => errors.has(f.key)).length : 0;

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

  /** Bring the first invalid control into view so the problem is never off-screen. */
  const scrollToFirstProblem = () => {
    const firstKey =
      fields.find((f) => errors.has(f.key))?.key ??
      (badPortfolio > 0 ? 'portfolio' : 'consent');
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-field-key="${firstKey}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const onSubmit = async () => {
    setShowErrors(true);
    if (!valid) {
      scrollToFirstProblem();
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
      /* error surfaced in the action bar below */
    }
  };

  const renderField = (f: FieldDef) => {
    const v = values[f.key];
    switch (f.type) {
      case 'select':
        return (
          <LabeledSelect
            key={f.key}
            fieldKey={f.key}
            label={f.label}
            required={f.required}
            value={(v as string) ?? ''}
            onChange={(nv) => set(f.key, nv)}
            onBlur={() => touch(f.key)}
            options={f.options ?? []}
            error={err(f)}
          />
        );
      case 'radio':
        return (
          <RadioChips
            key={f.key}
            fieldKey={f.key}
            label={f.label}
            required={f.required}
            column={f.column}
            value={(v as string) ?? ''}
            onChange={(nv) => {
              set(f.key, nv);
              touch(f.key);
            }}
            options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
            error={err(f)}
          />
        );
      case 'chips':
        return (
          <MultiChips
            key={f.key}
            fieldKey={f.key}
            label={f.label}
            required={f.required}
            hint={f.hint}
            value={(v as string[]) ?? []}
            onChange={(nv) => {
              set(f.key, nv);
              touch(f.key);
            }}
            options={f.options ?? []}
            error={err(f)}
          />
        );
      case 'textarea':
        return (
          <LabeledTextarea
            key={f.key}
            fieldKey={f.key}
            label={f.label}
            value={(v as string) ?? ''}
            onChange={(nv) => set(f.key, nv)}
            onBlur={() => touch(f.key)}
            placeholder={f.placeholder}
          />
        );
      default:
        return (
          <LabeledInput
            key={f.key}
            fieldKey={f.key}
            label={f.label}
            required={f.required}
            type={f.type === 'text' ? undefined : f.type}
            inputMode={f.type === 'number' ? 'numeric' : f.type === 'tel' ? 'tel' : undefined}
            autoComplete={
              f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : undefined
            }
            value={(v as string) ?? ''}
            onChange={(nv) => set(f.key, nv)}
            onBlur={() => touch(f.key)}
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
      <div className="mx-auto flex max-w-[860px] flex-col gap-4 px-4 pt-4 pb-16 sm:px-6">
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
            <div className="mt-2 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
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
    <div id="eoi-form" className="mx-auto flex max-w-[860px] flex-col gap-4 px-4 pt-4 pb-4 sm:px-6">
      <Link
        href="/partner"
        className="text-primary flex w-fit items-center gap-1.5 text-[13px] font-bold no-underline"
      >
        <Icon name="arrow-left" size={16} /> All partner tracks
      </Link>

      {/* Hero */}
      <div
        className="overflow-hidden rounded-[20px] p-5 text-white sm:p-6"
        style={{
          background: 'linear-gradient(120deg, var(--primary), var(--accent))',
          boxShadow: '0 20px 50px -26px rgba(28,60,143,.5)',
        }}
      >
        <span className="mb-2 inline-flex items-center gap-2 text-[12px] font-bold tracking-[0.14em] uppercase opacity-90">
          <Icon name={template.icon} size={16} /> {template.label}
        </span>
        <h1 className="m-0 mb-1.5 font-serif text-[22px] leading-snug font-bold sm:text-[26px]">
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
        <span className="text-[12px] font-semibold text-white/70">
          {pct}% of mandatory fields complete
        </span>
      </div>

      {sectionCards.map((s) => (
        <Section key={s.key} n={++n} title={s.title} hint={s.hint} errorCount={sectionErrorCount(s)}>
          {renderSection(s)}
        </Section>
      ))}

      {/* Documents ready */}
      <Section n={++n} title="Documents you have ready" hint={template.documents.hint}>
        <MultiChips
          label="Tick what you can share today — the rest can follow during onboarding."
          value={(values[DOCUMENTS_KEY] as string[]) ?? []}
          onChange={(v) => set(DOCUMENTS_KEY, v)}
          options={template.documents.options}
        />
      </Section>

      {/* Portfolio */}
      <Section
        n={++n}
        title={template.portfolio.title}
        hint={template.portfolio.hint}
        errorCount={showErrors ? badPortfolio : 0}
      >
        <div data-field-key="portfolio" className="scroll-mt-24">
          <PortfolioEditor
            config={template.portfolio}
            items={portfolio}
            onChange={setPortfolio}
            showErrors={showErrors}
          />
        </div>
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
          <label
            data-field-key="consent"
            className="flex scroll-mt-24 cursor-pointer items-start gap-2.5 text-[13.5px]"
          >
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
          {showErrors && !consent && (
            <span role="alert" className="text-[11.5px] font-semibold text-[#d14343]">
              Please tick the consent box to continue
            </span>
          )}
        </div>
      </Section>

      {/* Action bar — sticky so Submit stays in reach on phones. */}
      <div
        className="sticky bottom-0 z-30 -mx-4 flex flex-col gap-2.5 border-t border-white/15 px-4 py-3 backdrop-blur-md sm:mx-0 sm:px-0"
        style={{ background: 'color-mix(in srgb, var(--bg2) 82%, transparent)' }}
      >
        {showErrors && !valid && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[12px] border px-3.5 py-2.5 text-[13px] font-semibold"
            style={{ background: '#FDECEC', borderColor: '#F0B6B6', color: '#B3261E' }}
          >
            <Icon name="alert-circle" size={17} className="mt-[1px] flex-none" />
            <span>
              {problemCount === 1
                ? '1 field needs attention'
                : `${problemCount} fields need attention`}{' '}
              — they&apos;re highlighted in red above.
            </span>
          </div>
        )}
        {isError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[12px] border px-3.5 py-2.5 text-[13px] font-semibold"
            style={{ background: '#FDECEC', borderColor: '#F0B6B6', color: '#B3261E' }}
          >
            <Icon name="wifi-off" size={17} className="mt-[1px] flex-none" />
            <span>Couldn&apos;t submit — the server didn&apos;t respond. Please try again in a moment.</span>
          </div>
        )}
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="order-2 text-[12.5px] sm:order-1" style={{ color: valid ? 'var(--accent)' : 'rgba(255,255,255,.65)' }}>
            {valid
              ? 'All mandatory fields are filled — you can submit.'
              : 'Fields marked * are mandatory.'}
          </span>
          <Button
            variant="contained"
            color="primary"
            size="large"
            disabled={isLoading}
            onClick={onSubmit}
            sx={{
              order: { xs: 1, sm: 2 },
              width: { xs: '100%', sm: 'auto' },
              textTransform: 'none',
              fontWeight: 700,
            }}
          >
            {isLoading
              ? existing
                ? 'Saving…'
                : 'Submitting…'
              : existing
                ? 'Save my updates'
                : 'Submit expression of interest'}
          </Button>
        </div>
      </div>
    </div>
  );
}
