'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import {
  setSvcField,
  setOccasionField,
  toggleSvcPick,
  setTileSchedule,
  setSkipSection,
  type ServiceScalarKey,
} from '@/store/slices/servicesSlice';
import { selectDays } from '@/store/selectors/planSelectors';
import { selectServicesReady } from '@/store/selectors/servicesSelectors';
import { fmtBig, fmtSub } from '@/domain/format';
import {
  CATEGORY_BY_ID,
  TILE_CATEGORIES,
  OCCASION_TILES,
  SURPRISE_GIFTS,
  TIME_OPTIONS,
  GENDERS,
  MILESTONE_FOR,
  templateFor,
  detailsFor,
  type ServiceCategory,
  type ServiceOption,
} from '@/data/services';
import { CELEBRATIONS } from '@/data/celebrations';
import Icon from '@/components/ui/Icon';

const NAME_BY_ID = Object.fromEntries(CELEBRATIONS.map((c) => [c.id, c.name]));
const CATEGORY_OF = Object.fromEntries(CELEBRATIONS.map((c) => [c.id, c.category]));

/**
 * Step between Plan and Hotels. Each chosen celebration gets its own block
 * clubbing its basics (day, time, celebrant) with its tailored service tiles.
 * All chosen escapes collapse into a single block whose tiles are filtered by
 * experience (Wellness / Adventure / Local) and scheduled per tile.
 */
export default function ServicesStep() {
  const dispatch = useAppDispatch();
  const celebs = useAppSelector((s) => s.plan.celebs);
  const svc = useAppSelector((s) => s.services);
  const tourDays = useAppSelector(selectDays);

  const setField = (key: ServiceScalarKey, value: string) => dispatch(setSvcField({ key, value }));

  const celebrationIds = celebs.filter((id) => CATEGORY_OF[id] !== 'rejuvenate');
  const escapeIds = celebs.filter((id) => CATEGORY_OF[id] === 'rejuvenate');

  // Celebration blocks wrap their own tiles: the occasion's template sections
  // plus the shared celebration categories. Selection state is shared trip-wide,
  // so each category is rendered only under the first celebration that declares it.
  const sectionsFor = (id: string): string[] => {
    const bucket = TILE_CATEGORIES[CATEGORY_OF[id] ?? 'celebration'] ?? [];
    return [...templateFor(id).sections, ...bucket].filter((s, i, a) => a.indexOf(s) === i);
  };
  const sectionOwner = new Map<string, string>();
  celebrationIds.forEach((id) =>
    sectionsFor(id).forEach((s) => {
      if (!sectionOwner.has(s)) sectionOwner.set(s, id);
    }),
  );

  // All selected escapes collapse into one section with per-experience filters
  // (Wellness / Adventure / Local experiences) and per-tile day/time scheduling.
  const escapeCats = escapeIds
    .flatMap((id) => OCCASION_TILES[id] ?? [])
    .filter((c, i, a) => a.indexOf(c) === i)
    .map((cid) => CATEGORY_BY_ID[cid])
    .filter(Boolean);
  const escapeSchedule = (catId: string, optId: string) => {
    const key = `escape:${catId}:${optId}`;
    return (
      <TileSchedule
        tourDays={tourDays}
        value={svc.schedule[key] ?? { date: '', time: '' }}
        onChange={(field, value) => dispatch(setTileSchedule({ key, field, value }))}
      />
    );
  };

  // Top-level quick filter across the blocks: one pill per celebration, plus a
  // single "Escapes" pill (all escapes share one block). Shown only when there
  // is more than one block to jump between.
  const blocks = [
    ...celebrationIds.map((id) => ({ key: id, label: NAME_BY_ID[id] ?? id })),
    ...(escapeCats.length > 0 ? [{ key: 'escapes', label: 'Escapes' }] : []),
    // Surprise gifts always shows, regardless of the occasions chosen.
    { key: SURPRISE_GIFTS.id, label: SURPRISE_GIFTS.label },
  ];
  const [view, setView] = useState('all');
  const activeView = view === 'all' || blocks.some((b) => b.key === view) ? view : 'all';
  const showViewFilter = blocks.length > 1;

  // Single-open accordion: all panels start closed; opening one closes the rest.
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const panelProps = (key: string) => ({
    open: openPanel === key,
    onToggle: () => setOpenPanel((p) => (p === key ? null : key)),
  });

  // Continue unlocks once the user engages with the section — or opts out.
  const canContinue = useAppSelector(selectServicesReady);

  return (
    <div className="flex max-w-[804px] flex-col gap-6">
      {/* Heading */}
      <div className="flex flex-col gap-2">
        <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
          Celebration services
        </span>
        <span className="text-[13px] text-white/60">
          For each occasion, pick a day from your tour, a time, and the touches you&apos;d like.
        </span>
      </div>

      {/* Opt-out — unlocks Continue without picking any services */}
      <label className="flex w-fit cursor-pointer items-center gap-2.5 text-[13.5px] font-semibold text-white/80">
        <input
          type="checkbox"
          checked={svc.skipSection}
          onChange={(e) => dispatch(setSkipSection(e.target.checked))}
          className="h-4 w-4 accent-[color:var(--accent)]"
        />
        I&apos;ll skip this section — no services needed, take me to hotels.
      </label>

      {/* Quick filter across the occasion blocks */}
      {showViewFilter && (
        <div className="flex flex-wrap gap-2">
          <FilterPill label="All" active={activeView === 'all'} onClick={() => setView('all')} />
          {blocks.map((b) => (
            <FilterPill
              key={b.key}
              label={b.label}
              active={activeView === b.key}
              onClick={() => {
                setView(b.key);
                setOpenPanel(b.key);
              }}
            />
          ))}
        </div>
      )}

      {/* One clubbed block per selected celebration: basics + its services */}
      {celebrationIds
        .filter((id) => activeView === 'all' || activeView === id)
        .map((id) => {
          const tpl = templateFor(id);
          const occ = svc.occasions[id] ?? { date: '', time: '' };
          const owned = sectionsFor(id).filter((s) => sectionOwner.get(s) === id);
          const showMilestone = owned.includes('milestoneFor');
          const tileCats = owned.map((s) => CATEGORY_BY_ID[s]).filter(Boolean);
          return (
            <CollapsibleBlock key={id} title={NAME_BY_ID[id] ?? id} sub={tpl.blurb} {...panelProps(id)}>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
                {tpl.date && (
                  <Field label="Day">
                    <select
                      value={occ.date}
                      onChange={(e) =>
                        dispatch(setOccasionField({ id, key: 'date', value: e.target.value }))
                      }
                      className="text-ink rounded-[12px] border border-[#DAD6CC] bg-white px-3.5 py-2.5 text-[14px] font-semibold outline-none"
                    >
                      <option value="">Select a tour day</option>
                      {tourDays.map((iso) => (
                        <option key={iso} value={iso}>
                          {fmtBig(iso)} · {fmtSub(iso)}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {tpl.time && (
                  <Field label="Time of day">
                    <select
                      value={occ.time}
                      onChange={(e) =>
                        dispatch(setOccasionField({ id, key: 'time', value: e.target.value }))
                      }
                      className="text-ink rounded-[12px] border border-[#DAD6CC] bg-white px-3.5 py-2.5 text-[14px] font-semibold outline-none"
                    >
                      <option value="">Select a time</option>
                      {TIME_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {tpl.age && (
                  <Field label="Age (years)">
                    <input
                      type="number"
                      min={0}
                      max={120}
                      placeholder="—"
                      value={svc.age}
                      onChange={(e) =>
                        setField('age', e.target.value.replace(/[^0-9]/g, '').slice(0, 3))
                      }
                      className="text-ink w-[88px] rounded-[12px] border border-[#DAD6CC] bg-white px-3.5 py-2.5 text-[14px] font-semibold outline-none"
                    />
                  </Field>
                )}
                {tpl.gender && (
                  <ChipRow
                    label="Celebrant"
                    options={GENDERS}
                    value={svc.gender}
                    onSelect={(g) => setField('gender', g)}
                  />
                )}
              </div>

              {showMilestone && (
                <Section label="Celebrating" sub="Who or what is this for?">
                  <ChipRow
                    options={MILESTONE_FOR}
                    value={svc.milestoneFor}
                    onSelect={(mid) =>
                      setField('milestoneFor', mid === svc.milestoneFor ? '' : mid)
                    }
                  />
                </Section>
              )}
              {tileCats.length > 0 && (
                <OccasionTiles
                  cats={tileCats}
                  picks={svc.picks}
                  onToggle={(cat, oid) => dispatch(toggleSvcPick({ cat, id: oid }))}
                />
              )}
            </CollapsibleBlock>
          );
        })}

      {/* All escapes in one block: filter by Wellness / Adventure / Local */}
      {(activeView === 'all' || activeView === 'escapes') && escapeCats.length > 0 && (
        <CollapsibleBlock
          title="Escapes"
          sub="Add the experiences you'd like and set a day & time for each."
          {...panelProps('escapes')}
        >
          <OccasionTiles
            cats={escapeCats}
            picks={svc.picks}
            onToggle={(cat, oid) => dispatch(toggleSvcPick({ cat, id: oid }))}
            renderSchedule={escapeSchedule}
          />
        </CollapsibleBlock>
      )}

      {/* Surprise gifts — always available, independent of occasions */}
      {(activeView === 'all' || activeView === SURPRISE_GIFTS.id) && (
        <CollapsibleBlock
          title={SURPRISE_GIFTS.label}
          sub={SURPRISE_GIFTS.sub}
          {...panelProps(SURPRISE_GIFTS.id)}
        >
          <OccasionTiles
            cats={[SURPRISE_GIFTS]}
            picks={svc.picks}
            onToggle={(cat, oid) => dispatch(toggleSvcPick({ cat, id: oid }))}
          />
        </CollapsibleBlock>
      )}

      <Section label="Anything else?" sub="Special requests or ideas" {...panelProps('notes')}>
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
          <Icon name="info-circle" size={16} />{' '}
          {canContinue
            ? 'These help us shortlist the right hotels & packages.'
            : 'Pick at least one service — or tick "skip this section" above to move on.'}
        </span>
        <div className="flex gap-2">
          <Button
            variant="text"
            onClick={() => dispatch(setStep('plan'))}
            sx={{ color: 'rgba(255,255,255,.7)' }}
          >
            Back
          </Button>
          <Button
            variant="contained"
            size="large"
            disabled={!canContinue}
            onClick={() => dispatch(setStep('stay'))}
            endIcon={<Icon name="arrow-right" size={18} />}
            sx={{
              background: 'linear-gradient(180deg,#e9c97f,#d4a94f)',
              color: '#08201f',
              fontWeight: 800,
              boxShadow: 'none',
              '&:hover': {
                background: 'linear-gradient(180deg,#edd089,#d9af55)',
                boxShadow: 'none',
              },
              '&.Mui-disabled': { background: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.4)' },
            }}
          >
            Continue to hotels
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * A labelled block on the dark canvas — collapsible. Pass `open`/`onToggle` to
 * join the page's single-open accordion; omit them for a standalone toggle.
 */
function Section({
  label,
  sub,
  children,
  open: openProp,
  onToggle,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
}) {
  const [localOpen, setLocalOpen] = useState(true);
  const open = openProp ?? localOpen;
  const toggle = onToggle ?? (() => setLocalOpen((o) => !o));
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex cursor-pointer items-baseline justify-between gap-2 border-none bg-transparent p-0 text-left"
      >
        <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
          {label}
        </span>
        <span className="flex items-center gap-2">
          {sub && <span className="text-[12.5px] text-white/55">{sub}</span>}
          <Icon
            name={open ? 'chevron-up' : 'chevron-down'}
            size={15}
            style={{ color: 'rgba(255,255,255,.55)' }}
          />
        </span>
      </button>
      {open && children}
    </div>
  );
}

/**
 * Accordion wrapper for the occasion blocks — same transparent surface and
 * header as before, with a chevron toggle. Controlled by the page's
 * single-open accordion state (all closed by default).
 */
function CollapsibleBlock({
  title,
  sub,
  children,
  open,
  onToggle,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[16px] border border-white/10 bg-white/[0.03] p-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex cursor-pointer items-center justify-between gap-3 border-none bg-transparent p-0 text-left"
      >
        <span className="flex flex-col gap-0.5">
          <span className="font-serif text-[18px] font-bold text-white">{title}</span>
          {sub && <span className="text-[12.5px] text-white/55">{sub}</span>}
        </span>
        <Icon
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          style={{ color: 'rgba(255,255,255,.6)' }}
        />
      </button>
      {open && children}
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

/**
 * All of an occasion's package tiles combined into one grid, with single-select
 * category filter pills (radio-style) above. "All" shows everything; picking a
 * category narrows the grid. Selection state lives per category in the store.
 */
function OccasionTiles({
  cats,
  picks,
  onToggle,
  renderSchedule,
}: {
  cats: ServiceCategory[];
  picks: Record<string, string[]>;
  onToggle: (cat: string, id: string) => void;
  /** When set, each tile shows this per-experience day/time control (escapes). */
  renderSchedule?: (catId: string, optionId: string) => React.ReactNode;
}) {
  const [filter, setFilter] = useState('all');
  const active = cats.some((c) => c.id === filter) ? filter : 'all';
  const shown = active === 'all' ? cats : cats.filter((c) => c.id === active);
  const tiles = shown.flatMap((c) => c.options.map((o) => ({ catId: c.id, option: o })));
  // A single category needs no filter — the grid already shows only its tiles.
  const showFilters = cats.length > 1;

  return (
    <div className="flex flex-col gap-3">
      {showFilters && (
        <div className="flex flex-wrap gap-2">
          <FilterPill label="All" active={active === 'all'} onClick={() => setFilter('all')} />
          {cats.map((c) => (
            <FilterPill
              key={c.id}
              label={c.label}
              active={active === c.id}
              onClick={() => setFilter(c.id)}
            />
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(({ catId, option }) => (
          <PackageTile
            key={`${catId}:${option.id}`}
            option={option}
            active={(picks[catId] ?? []).includes(option.id)}
            onToggle={() => onToggle(catId, option.id)}
            schedule={renderSchedule?.(catId, option.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** Single-select filter pill (radio-style) for the tile category filter. */
function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className="rounded-full border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors"
      style={{
        background: active ? 'var(--accent)' : 'transparent',
        borderColor: active ? 'var(--accent)' : 'rgba(255,255,255,.22)',
        color: active ? '#08201F' : 'rgba(255,255,255,.75)',
      }}
    >
      {label}
    </button>
  );
}

/** A single package card: image carousel, title, description, price + add/added. */
function PackageTile({
  option,
  active,
  onToggle,
  schedule,
}: {
  option: ServiceOption;
  active: boolean;
  onToggle: () => void;
  /** Optional per-tile day/time control, rendered below the card (escapes). */
  schedule?: React.ReactNode;
}) {
  const images = option.images ?? [];
  const [idx, setIdx] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const step = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setIdx((i) => (i + delta + images.length) % images.length);
  };

  return (
    <div
      className="group flex flex-col overflow-hidden rounded-[16px] border-[1.5px] transition-colors"
      style={{ background: '#FAF7F2', borderColor: active ? 'var(--accent)' : '#EBE1CF' }}
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={onToggle}
        className="flex flex-1 flex-col text-left"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/10">
          {images.length > 0 && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={images[idx]}
              alt={option.label}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          )}
          {images.length > 1 && (
            <>
              <span
                role="button"
                tabIndex={-1}
                aria-label="Previous image"
                onClick={step(-1)}
                className="absolute top-1/2 left-1.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Icon name="chevron-left" size={15} />
              </span>
              <span
                role="button"
                tabIndex={-1}
                aria-label="Next image"
                onClick={step(1)}
                className="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Icon name="chevron-right" size={15} />
              </span>
              <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                {images.map((src, i) => (
                  <span
                    key={src}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: i === idx ? 12 : 6,
                      background: i === idx ? '#fff' : 'rgba(255,255,255,.6)',
                    }}
                  />
                ))}
              </div>
            </>
          )}
          {active && (
            <span
              className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full"
              style={{ background: 'var(--accent)', color: '#08201F' }}
            >
              <Icon name="check" size={15} />
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 p-3">
          <div className="flex items-center gap-1.5">
            <Icon name={option.icon} size={15} className="text-ink/70" />
            <span className="text-ink text-[14px] leading-tight font-bold">{option.label}</span>
          </div>
          {option.description && (
            <span className="text-ink/55 text-[12px] leading-snug">{option.description}</span>
          )}
          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            {option.price != null && (
              <span className="text-ink text-[13px] font-extrabold">
                ₹{option.price.toLocaleString('en-IN')}
                <span className="text-ink/45 ml-1 text-[11px] font-medium">onwards</span>
              </span>
            )}
            <span
              className="rounded-full px-2.5 py-1 text-[12px] font-bold"
              style={{
                background: active ? 'var(--accent)' : '#08201F',
                color: active ? '#08201F' : '#fff',
              }}
            >
              {active ? 'Added' : 'Add'}
            </span>
          </div>
        </div>
      </button>
      <div className="flex flex-col gap-2 border-t border-[#EBE1CF] p-3">
        {schedule}
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="text-ink/70 hover:text-ink hover:border-accent flex items-center justify-center gap-1.5 rounded-[10px] border border-[#DAD6CC] bg-white py-1.5 text-[12px] font-bold transition-colors"
        >
          <Icon name="list-details" size={14} /> View details
        </button>
      </div>
      {showDetails && (
        <PackageDetails
          option={option}
          active={active}
          onToggle={onToggle}
          onClose={() => setShowDetails(false)}
        />
      )}
    </div>
  );
}

/** Details modal: hero image, itinerary, inclusions and exclusions + add/close. */
function PackageDetails({
  option,
  active,
  onToggle,
  onClose,
}: {
  option: ServiceOption;
  active: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { itinerary, inclusions, exclusions } = detailsFor(option);
  const hero = option.images?.[0];
  const addToCart = () => {
    if (!active) onToggle();
    onClose();
  };
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[18px] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {hero && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={hero} alt={option.label} className="h-40 w-full object-cover" />
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Icon name={option.icon} size={18} className="text-ink/70" />
              <h2 className="text-ink m-0 font-serif text-[20px] font-bold">{option.label}</h2>
            </div>
            {option.description && (
              <p className="text-ink/60 m-0 text-[13px]">{option.description}</p>
            )}
            {option.price != null && (
              <span className="text-ink text-[14px] font-extrabold">
                ₹{option.price.toLocaleString('en-IN')}
                <span className="text-ink/45 ml-1 text-[11px] font-medium">onwards</span>
              </span>
            )}
          </div>

          <DetailBlock title="Itinerary">
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {itinerary.map((s, i) => (
                <li key={s} className="text-ink/80 flex gap-2.5 text-[13px]">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-[#08201F]"
                    style={{ background: 'var(--accent)' }}
                  >
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </DetailBlock>

          <DetailBlock title="Inclusions">
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {inclusions.map((s) => (
                <li key={s} className="text-ink/80 flex items-start gap-2 text-[13px]">
                  <Icon
                    name="circle-check"
                    size={16}
                    className="mt-0.5 shrink-0"
                    style={{ color: '#1E9E6A' }}
                  />
                  {s}
                </li>
              ))}
            </ul>
          </DetailBlock>

          <DetailBlock title="Exclusions">
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {exclusions.map((s) => (
                <li key={s} className="text-ink/80 flex items-start gap-2 text-[13px]">
                  <Icon
                    name="circle-x"
                    size={16}
                    className="mt-0.5 shrink-0"
                    style={{ color: '#C0392B' }}
                  />
                  {s}
                </li>
              ))}
            </ul>
          </DetailBlock>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#EBE1CF] p-4">
          <Button variant="text" onClick={onClose} sx={{ color: 'var(--ink)', fontWeight: 700 }}>
            Close
          </Button>
          <Button
            variant="contained"
            onClick={addToCart}
            startIcon={<Icon name={active ? 'check' : 'shopping-cart-plus'} size={16} />}
            sx={{
              background: 'linear-gradient(180deg,#e9c97f,#d4a94f)',
              color: '#08201f',
              fontWeight: 800,
              boxShadow: 'none',
              '&:hover': {
                background: 'linear-gradient(180deg,#edd089,#d9af55)',
                boxShadow: 'none',
              },
            }}
          >
            {active ? 'Added' : 'Add to cart'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A titled block inside the details modal. */
function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
        {title}
      </span>
      {children}
    </div>
  );
}

/** Compact day + time selectors placed inside an escape tile. */
function TileSchedule({
  tourDays,
  value,
  onChange,
}: {
  tourDays: string[];
  value: { date: string; time: string };
  onChange: (field: 'date' | 'time', value: string) => void;
}) {
  const sel =
    'text-ink w-full rounded-[10px] border border-[#DAD6CC] bg-white px-2.5 py-2 text-[12.5px] font-semibold outline-none';
  const lbl = 'text-ink/50 text-[9.5px] font-black tracking-[0.05em] uppercase';
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="flex flex-col gap-1">
        <span className={lbl}>Day</span>
        <select
          className={sel}
          value={value.date}
          onChange={(e) => onChange('date', e.target.value)}
        >
          <option value="">Select</option>
          {tourDays.map((iso) => (
            <option key={iso} value={iso}>
              {fmtBig(iso)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={lbl}>Time</span>
        <select
          className={sel}
          value={value.time}
          onChange={(e) => onChange('time', e.target.value)}
        >
          <option value="">Select</option>
          {TIME_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
