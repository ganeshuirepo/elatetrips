'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import {
  setSvcField,
  setSvcGuests,
  toggleSvcPick,
  type ServiceScalarKey,
} from '@/store/slices/servicesSlice';
import {
  SHARED_CATEGORIES,
  SPECIAL_CATEGORIES,
  TIME_OPTIONS,
  VENUE_OPTIONS,
  AGE_GROUPS,
  GENDERS,
  MILESTONE_FOR,
  templateFor,
  type ServiceCategory,
  type ServiceOption,
} from '@/data/services';
import { CELEBRATIONS } from '@/data/celebrations';
import Stepper from '@/components/ui/Stepper';
import Icon from '@/components/ui/Icon';

const NAME_BY_ID = Object.fromEntries(CELEBRATIONS.map((c) => [c.id, c.name]));

/**
 * Step between Plan and Hotels: gather the kind of celebration services wanted.
 * The basic questions adapt to the selected occasion(s) via per-occasion
 * templates; shared option grids (decor, food, music, …) are offered to all.
 */
export default function ServicesStep() {
  const dispatch = useAppDispatch();
  const celebs = useAppSelector((s) => s.plan.celebs);
  const svc = useAppSelector((s) => s.services);

  // The chosen occasions drive which questions appear. Combine their needs so a
  // shared field (date, guests…) is asked once, and gather their extra sections.
  const templates = (celebs.length ? celebs : ['']).map((id) => ({ id, t: templateFor(id) }));
  const need = (k: 'date' | 'time' | 'guests' | 'age' | 'gender') =>
    templates.some(({ t }) => t[k]);
  const sections = [...new Set(templates.flatMap(({ t }) => t.sections))];

  const setField = (key: ServiceScalarKey, value: string) => dispatch(setSvcField({ key, value }));

  return (
    <div className="flex max-w-[804px] flex-col gap-6">
      {/* Heading */}
      <div className="flex flex-col gap-2">
        <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
          Celebration services
        </span>
        <span className="text-[13px] text-white/60">
          Tell us what you&apos;re celebrating and the touches you&apos;d like — we&apos;ll match
          hotels and packages to suit.
        </span>
        {celebs.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {celebs.map((id) => (
              <span
                key={id}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold"
                style={{
                  color: 'var(--accent)',
                  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                }}
              >
                {NAME_BY_ID[id] ?? id}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Basics — adapt to the occasion templates */}
      <Section label="The basics" sub="When, who and how">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
          {need('date') && (
            <Field label="Date">
              <input
                type="date"
                value={svc.date}
                onChange={(e) => setField('date', e.target.value)}
                className="text-ink rounded-[12px] border border-[#DAD6CC] bg-white px-3.5 py-2.5 text-[14px] font-semibold outline-none"
              />
            </Field>
          )}
          {need('guests') && (
            <Field label="Guests">
              <Stepper
                ariaLabel="Guests"
                value={svc.guests}
                min={1}
                max={500}
                onDec={() => dispatch(setSvcGuests(svc.guests - 1))}
                onInc={() => dispatch(setSvcGuests(svc.guests + 1))}
              />
            </Field>
          )}
          {need('age') && (
            <Field label="Age (years)">
              <input
                type="number"
                min={0}
                max={120}
                placeholder="—"
                value={svc.age}
                onChange={(e) => setField('age', e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                className="text-ink w-[88px] rounded-[12px] border border-[#DAD6CC] bg-white px-3.5 py-2.5 text-[14px] font-semibold outline-none"
              />
            </Field>
          )}
        </div>

        {need('time') && (
          <ChipRow
            label="Time of day"
            options={TIME_OPTIONS}
            value={svc.time}
            onSelect={(id) => setField('time', id === svc.time ? '' : id)}
          />
        )}
        {need('gender') && (
          <ChipRow
            label="Celebrant"
            options={GENDERS}
            value={svc.gender}
            onSelect={(id) => setField('gender', id)}
          />
        )}
      </Section>

      {/* Occasion-specific sections */}
      {sections.map((sec) => {
        if (sec === 'ageGroup') {
          return (
            <Section key={sec} label="Age group" sub="We'll tailor the activities & menu">
              <ChipRow
                options={AGE_GROUPS}
                value={svc.ageGroup}
                onSelect={(id) => setField('ageGroup', id === svc.ageGroup ? '' : id)}
              />
            </Section>
          );
        }
        if (sec === 'milestoneFor') {
          return (
            <Section key={sec} label="Celebrating" sub="Who or what is this milestone for?">
              <ChipRow
                options={MILESTONE_FOR}
                value={svc.milestoneFor}
                onSelect={(id) => setField('milestoneFor', id === svc.milestoneFor ? '' : id)}
              />
            </Section>
          );
        }
        const cat = SPECIAL_CATEGORIES[sec];
        if (!cat) return null;
        return (
          <Section key={sec} label={cat.label} sub={cat.sub}>
            <OptionGrid
              category={cat}
              selected={svc.picks[cat.id] ?? []}
              onToggle={(id) => dispatch(toggleSvcPick({ cat: cat.id, id }))}
            />
          </Section>
        );
      })}

      {/* Shared service categories */}
      {SHARED_CATEGORIES.map((cat) => (
        <Section key={cat.id} label={cat.label} sub={cat.sub}>
          <OptionGrid
            category={cat}
            selected={svc.picks[cat.id] ?? []}
            onToggle={(id) => dispatch(toggleSvcPick({ cat: cat.id, id }))}
          />
        </Section>
      ))}

      {/* Venue + notes */}
      <Section label="Venue" sub="Indoor, outdoor or either">
        <ChipRow
          options={VENUE_OPTIONS}
          value={svc.venue}
          onSelect={(id) => setField('venue', id === svc.venue ? '' : id)}
        />
      </Section>

      <Section label="Anything else?" sub="Special requests or ideas">
        <textarea
          value={svc.notes}
          onChange={(e) => setField('notes', e.target.value)}
          rows={3}
          placeholder="Tell us about themes, colours, dietary needs, surprises…"
          className="text-ink w-full resize-none rounded-[14px] border border-[#DAD6CC] bg-white px-4 py-3 text-[14px] outline-none"
        />
      </Section>

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4">
        <span className="flex items-center gap-2 text-[13px] text-white/65">
          <Icon name="info-circle" size={16} /> These help us shortlist the right hotels &amp;
          packages — all optional.
        </span>
        <div className="flex gap-2">
          <Button
            variant="text"
            onClick={() => dispatch(setStep('celebration'))}
            sx={{ color: 'rgba(255,255,255,.7)' }}
          >
            Back
          </Button>
          <Button
            variant="contained"
            size="large"
            onClick={() => dispatch(setStep('stay'))}
            endIcon={<Icon name="arrow-right" size={18} />}
            sx={{
              background: 'linear-gradient(180deg,#e9c97f,#d4a94f)',
              color: '#08201f',
              fontWeight: 800,
              boxShadow: 'none',
              '&:hover': { background: 'linear-gradient(180deg,#edd089,#d9af55)', boxShadow: 'none' },
            }}
          >
            Continue to hotels
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A labelled block on the dark canvas. */
function Section({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
          {label}
        </span>
        {sub && <span className="text-[12.5px] text-white/55">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

/** A small label above an inline input. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10.5px] font-black tracking-[0.05em] text-white/55 uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

const chipClass =
  'flex items-center gap-2 rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold transition-colors';

/** Single-select chip row. */
function ChipRow({
  label,
  options,
  value,
  onSelect,
}: {
  label?: string;
  options: ServiceOption[];
  value: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span className="text-[10.5px] font-black tracking-[0.05em] text-white/55 uppercase">
          {label}
        </span>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(o.id)}
              className={chipClass}
              style={{
                background: active ? 'var(--accent)' : '#FAF7F2',
                borderColor: active ? 'var(--accent)' : '#EBE1CF',
                color: active ? '#08201F' : 'var(--ink)',
              }}
            >
              <Icon name={o.icon} size={16} />
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Multi-select option grid for a category. */
function OptionGrid({
  category,
  selected,
  onToggle,
}: {
  category: ServiceCategory;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {category.options.map((o) => {
        const active = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(o.id)}
            className={chipClass}
            style={{
              background: active ? 'var(--accent)' : '#FAF7F2',
              borderColor: active ? 'var(--accent)' : '#EBE1CF',
              color: active ? '#08201F' : 'var(--ink)',
            }}
          >
            <Icon name={o.icon} size={16} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
