'use client';

import { useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import {
  toggleInterest,
  toggleServicePref,
  addTimelineItem,
  removeTimelineItem,
  setTimeline,
} from '@/store/slices/prefsSlice';
import { selectDays } from '@/store/selectors/planSelectors';
import {
  TIME_OPTIONS,
  minutesLabel,
  dayHours,
  itemsOn,
  nextStart,
  suggestSlot,
  fitsOn,
  autoFillTimeline,
  DAY_COMFORT_H,
  DAY_CAPACITY_H,
  type TimelineItem,
  type TimelineKind,
} from '@/domain/timeline';
import { OOTY_PLACES, PLACE_INTERESTS, SERVICE_PREFS } from '@/data/ootyPlaces';
import { SHARED_CATEGORIES, SPECIAL_CATEGORIES, SURPRISE_GIFTS } from '@/data/services';
import { ADVENTURES, EXPERIENCES } from '@/data/activities';
import { fmtDay } from '@/domain/format';
import { GOLD_BUTTON } from '@/components/planner/goldButton';
import Icon from '@/components/ui/Icon';

/** One addable row in the catalog — a place, a service or an adventure. */
interface CatalogEntry {
  kind: TimelineKind;
  refId: string;
  name: string;
  meta: string;
  durationH: number;
  icon: string;
}

/** Typical time a celebration service occupies in the day, by category. */
const SERVICE_DURATION: Record<string, number> = {
  decor: 2,
  onground: 3,
  food: 2,
  music: 2.5,
  welcome: 1,
  romance: 1.5,
  surprises: 1,
  menu: 1.5,
  surprisegifts: 0.5,
};

function buildCatalog(): CatalogEntry[] {
  const places: CatalogEntry[] = OOTY_PLACES.map((p) => ({
    kind: 'place',
    refId: p.id,
    name: p.name,
    meta: `${p.distanceKm} km · ${p.fee}`,
    durationH: p.durationH,
    icon: 'map-pin',
  }));

  const seen = new Set<string>();
  const services: CatalogEntry[] = [];
  for (const cat of [...SHARED_CATEGORIES, ...Object.values(SPECIAL_CATEGORIES), SURPRISE_GIFTS]) {
    for (const o of cat.options) {
      const key = `${cat.id}:${o.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      services.push({
        kind: 'service',
        refId: key,
        name: o.label,
        meta: `${cat.label}${o.price != null ? ` · ₹${o.price.toLocaleString('en-IN')}` : ''}`,
        durationH: SERVICE_DURATION[cat.id] ?? 1.5,
        icon: o.icon,
      });
    }
  }

  const adventures: CatalogEntry[] = [
    ...ADVENTURES.map((v) => ({
      kind: 'adventure' as const,
      refId: `adv:${v.id}`,
      name: v.name,
      meta: `${v.sub} · ₹${v.price.toLocaleString('en-IN')}/person`,
      durationH: 2.5,
      icon: v.icon,
    })),
    ...EXPERIENCES.map((v) => ({
      kind: 'adventure' as const,
      refId: `exp:${v.id}`,
      name: v.name,
      meta: `${v.sub} · ₹${v.price.toLocaleString('en-IN')}/person`,
      durationH: 2,
      icon: v.icon,
    })),
  ];

  return [...places, ...services, ...adventures];
}

const KIND_META: Record<TimelineKind, { label: string; icon: string }> = {
  place: { label: 'Places', icon: 'map-pin' },
  service: { label: 'Services', icon: 'sparkles' },
  adventure: { label: 'Adventures', icon: 'mountain' },
};

const fmtH = (h: number) => (h >= 1 ? `~${+h.toFixed(1)}h` : `~${Math.round(h * 60)}min`);

/** Multi-select chip shared by both preference groups. */
function PrefChip({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold transition-colors"
      style={{
        background: active ? 'var(--accent)' : '#FAF7F2',
        borderColor: active ? 'var(--accent)' : '#EBE1CF',
        color: active ? '#08201F' : 'var(--ink)',
      }}
    >
      <Icon name={icon} size={16} />
      {label}
    </button>
  );
}

/**
 * Step 2 — Preferences: interests, then the trip timeline. Places, services
 * and adventures live in one filterable list; adding an item suggests the
 * next free slot, overflows to the next day when one is full, and warns when
 * a day gets packed.
 */
export default function PreferencesStep() {
  const dispatch = useAppDispatch();
  const { interests, servicePrefs, timeline } = useAppSelector((s) => s.prefs);
  const days = useAppSelector(selectDays);

  const catalog = useMemo(buildCatalog, []);
  const [filter, setFilter] = useState<'all' | TimelineKind>('all');
  const [showTimeline, setShowTimeline] = useState(false);

  // Inline add flow
  const [adding, setAdding] = useState<CatalogEntry | null>(null);
  const [selDay, setSelDay] = useState('');
  const [selTime, setSelTime] = useState(TIME_OPTIONS[4]);

  const shown = catalog.filter((e) => filter === 'all' || e.kind === filter);
  const noDates = days.length === 0;

  const beginAdd = (entry: CatalogEntry) => {
    const slot = suggestSlot(timeline, days, entry.durationH);
    setAdding(entry);
    setSelDay(slot?.day ?? days[0]);
    setSelTime(slot?.startMin ?? TIME_OPTIONS[4]);
  };

  const pickDay = (day: string) => {
    setSelDay(day);
    setSelTime(nextStart(timeline, day));
  };

  const confirmAdd = () => {
    if (!adding || !fitsOn(timeline, selDay, adding.durationH)) return;
    dispatch(
      addTimelineItem({
        id: `${adding.kind}:${adding.refId}:${selDay}:${selTime}`,
        kind: adding.kind,
        refId: adding.refId,
        name: adding.name,
        day: selDay,
        startMin: selTime,
        durationH: adding.durationH,
        meta: adding.meta,
      }),
    );
    setShowTimeline(true);
    setAdding(null);
  };

  /** Add-flow status for the currently selected day. */
  const addStatus = useMemo(() => {
    if (!adding) return null;
    const after = dayHours(timeline, selDay) + adding.durationH;
    const dayNo = days.indexOf(selDay) + 1;
    if (!fitsOn(timeline, selDay, adding.durationH)) {
      const alt = suggestSlot(timeline, days, adding.durationH);
      return {
        kind: 'error' as const,
        text: `Day ${dayNo} is already full (${dayHours(timeline, selDay).toFixed(1)}h planned). ${
          alt ? `Try Day ${days.indexOf(alt.day) + 1} instead.` : 'Remove an item or extend your dates.'
        }`,
      };
    }
    if (after > DAY_COMFORT_H)
      return {
        kind: 'warn' as const,
        text: `This makes Day ${dayNo} a packed ${after.toFixed(1)}-hour day — a lighter day might be more fun.`,
      };
    return { kind: 'ok' as const, text: `Fits nicely — Day ${dayNo}, ${minutesLabel(selTime)}.` };
  }, [adding, selDay, selTime, timeline, days]);

  return (
    <div className="flex flex-col gap-6">
      {/* Heading */}
      <div className="flex flex-col gap-1">
        <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
          Preferences
        </span>
        <span className="text-[13px] text-white/60">
          Tell us what you love, then build your day-by-day timeline.
        </span>
      </div>

      {/* Interests */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
            What are you into?
          </span>
          <span className="text-[12.5px] text-white/55">Used by the auto-planner</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PLACE_INTERESTS.map((i) => (
            <PrefChip
              key={i.id}
              label={i.label}
              icon={i.icon}
              active={interests.includes(i.id)}
              onClick={() => dispatch(toggleInterest(i.id))}
            />
          ))}
        </div>
      </div>

      {/* Service types */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
            Celebration services you&apos;d like
          </span>
          <span className="text-[12.5px] text-white/55">We&apos;ll highlight these on the Surprises step</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SERVICE_PREFS.map((sp) => (
            <PrefChip
              key={sp.id}
              label={sp.label}
              icon={sp.icon}
              active={servicePrefs.includes(sp.id)}
              onClick={() => dispatch(toggleServicePref(sp.id))}
            />
          ))}
        </div>
      </div>

      {/* Timeline header + controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
            Plan your days
          </span>
          <span className="text-[12.5px] text-white/55">
            {noDates
              ? 'Pick your tour dates on the Plan step to start the timeline.'
              : `${days.length} day${days.length > 1 ? 's' : ''} · a comfortable day is ~${DAY_COMFORT_H}h of plans`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {!noDates && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                dispatch(setTimeline(autoFillTimeline(days, interests)));
                setShowTimeline(true);
              }}
              startIcon={<Icon name="wand" size={15} />}
              sx={{ color: 'rgba(255,255,255,.85)', borderColor: 'rgba(255,255,255,.3)' }}
            >
              Auto-plan
            </Button>
          )}
          <Button
            size="small"
            variant={showTimeline ? 'contained' : 'outlined'}
            onClick={() => setShowTimeline((o) => !o)}
            startIcon={<Icon name="calendar-time" size={15} />}
            sx={
              showTimeline
                ? { ...GOLD_BUTTON, py: 0.5 }
                : { color: 'rgba(255,255,255,.85)', borderColor: 'rgba(255,255,255,.3)' }
            }
          >
            Timeline ({timeline.length})
          </Button>
        </div>
      </div>

      {/* Timeline panel */}
      {showTimeline && !noDates && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
          {days.map((day, i) => {
            const list = itemsOn(timeline, day);
            const hours = dayHours(timeline, day);
            const packed = hours > DAY_COMFORT_H;
            return (
              <div key={day} className="flex flex-col gap-2 rounded-[16px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-serif text-[16px] font-bold text-white">Day {i + 1}</span>
                  <span className="text-[11.5px] text-white/55">{fmtDay(day)}</span>
                </div>
                <span
                  className="text-[11.5px] font-bold"
                  style={{ color: packed ? '#E8A87C' : 'rgba(255,255,255,.45)' }}
                >
                  {hours > 0 ? `${hours.toFixed(1)}h planned` : 'Nothing planned yet'}
                  {packed && ' · packed'}
                </span>
                {list.map((it) => (
                  <div key={it.id} className="flex items-start gap-2">
                    <span
                      className="mt-[1px] w-[64px] flex-none rounded-md px-1.5 py-0.5 text-center text-[10.5px] font-black"
                      style={{ background: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)' }}
                    >
                      {minutesLabel(it.startMin)}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] leading-tight font-bold text-white">
                        {it.name} <span className="font-medium text-white/45">{fmtH(it.durationH)}</span>
                      </span>
                      <span className="text-[11px] text-white/45">{it.meta}</span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${it.name}`}
                      onClick={() => dispatch(removeTimelineItem(it.id))}
                      className="cursor-pointer border-none bg-transparent p-0 text-white/40 hover:text-[#E8A87C]"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                ))}
                {packed && (
                  <span className="flex items-start gap-1.5 text-[11.5px] font-semibold" style={{ color: '#E8A87C' }}>
                    <Icon name="alert-triangle" size={13} className="mt-[1px] flex-none" />
                    Too many plans for one day — consider moving something to a day with room.
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Catalog list with filters */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {(['all', 'place', 'service', 'adventure'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className="rounded-full border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors"
              style={{
                background: filter === f ? 'var(--accent)' : 'transparent',
                borderColor: filter === f ? 'var(--accent)' : 'rgba(255,255,255,.22)',
                color: filter === f ? '#08201F' : 'rgba(255,255,255,.75)',
              }}
            >
              {f === 'all' ? `All (${catalog.length})` : KIND_META[f].label}
            </button>
          ))}
        </div>

        <div className="flex max-h-[560px] flex-col gap-2 overflow-y-auto pr-1">
          {shown.map((entry) => {
            const isAdding = adding?.kind === entry.kind && adding?.refId === entry.refId;
            return (
              <div
                key={`${entry.kind}:${entry.refId}`}
                className="flex flex-col rounded-[14px] border-[1.5px] border-[#EBE1CF] bg-[#FAF7F2] px-3.5 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Icon name={entry.icon} size={18} style={{ color: 'var(--primary)' }} className="flex-none" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-ink text-[13.5px] leading-tight font-bold">{entry.name}</span>
                    <span className="text-muted text-[11.5px]">{entry.meta}</span>
                  </div>
                  <span className="text-ink/60 flex-none rounded-md bg-white px-2 py-0.5 text-[11px] font-bold">
                    <Icon name="clock" size={11} /> {fmtH(entry.durationH)}
                  </span>
                  <Button
                    size="small"
                    variant={isAdding ? 'outlined' : 'contained'}
                    color="primary"
                    disabled={noDates}
                    onClick={() => (isAdding ? setAdding(null) : beginAdd(entry))}
                  >
                    {isAdding ? 'Cancel' : 'Add'}
                  </Button>
                </div>

                {isAdding && (
                  <div className="mt-2.5 flex flex-col gap-2 border-t border-[#EBE1CF] pt-2.5">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-muted text-[10px] font-black tracking-[0.05em] uppercase">Day</span>
                        <select
                          value={selDay}
                          onChange={(e) => pickDay(e.target.value)}
                          className="text-ink rounded-[10px] border border-[#DAD6CC] bg-white px-2.5 py-2 text-[13px] font-semibold outline-none"
                        >
                          {days.map((d, i) => (
                            <option key={d} value={d}>
                              Day {i + 1} · {fmtDay(d)} ({dayHours(timeline, d).toFixed(1)}h)
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-muted text-[10px] font-black tracking-[0.05em] uppercase">Time</span>
                        <select
                          value={selTime}
                          onChange={(e) => setSelTime(Number(e.target.value))}
                          className="text-ink rounded-[10px] border border-[#DAD6CC] bg-white px-2.5 py-2 text-[13px] font-semibold outline-none"
                        >
                          {TIME_OPTIONS.map((t) => (
                            <option key={t} value={t}>
                              {minutesLabel(t)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        disabled={addStatus?.kind === 'error'}
                        onClick={confirmAdd}
                        startIcon={<Icon name="calendar-plus" size={15} />}
                      >
                        Add to Day {days.indexOf(selDay) + 1}
                      </Button>
                    </div>
                    {addStatus && (
                      <span
                        className="text-[12px] font-semibold"
                        style={{
                          color:
                            addStatus.kind === 'error' ? '#C0392B' : addStatus.kind === 'warn' ? '#B96212' : '#1E7A3A',
                        }}
                      >
                        {addStatus.text}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action bar */}
      <div
        className="sticky bottom-0 z-30 flex flex-col gap-2 border-t border-white/15 py-3 backdrop-blur-md"
        style={{ background: 'color-mix(in srgb, var(--bg2) 82%, transparent)' }}
      >
        <span className="flex items-center gap-2 text-[13px] text-white/65">
          <Icon name="info-circle" size={16} /> All optional — the timeline keeps every day
          comfortable (max {DAY_CAPACITY_H}h).
        </span>
        <div className="flex w-full items-center justify-between gap-3">
          <Button
            variant="contained"
            size="large"
            onClick={() => dispatch(setStep('plan'))}
            startIcon={<Icon name="arrow-left" size={18} />}
            sx={GOLD_BUTTON}
          >
            Back
          </Button>
          <Button
            variant="contained"
            size="large"
            onClick={() => dispatch(setStep('services'))}
            endIcon={<Icon name="arrow-right" size={18} />}
            sx={GOLD_BUTTON}
          >
            Continue to surprises
          </Button>
        </div>
      </div>
    </div>
  );
}
