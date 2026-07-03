'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import {
  toggleInterest,
  toggleServicePref,
  addTimelineItem,
  removeTimelineItem,
  moveTimelineItem,
  setTimeline,
} from '@/store/slices/prefsSlice';
import { selectDays } from '@/store/selectors/planSelectors';
import {
  SERVICE_TIME_OPTIONS,
  minutesLabel,
  dayHours,
  daylightHours,
  itemsOn,
  nextDaylightStart,
  nextServiceStart,
  suggestDaylightSlot,
  daylightFits,
  moveTarget,
  autoFillTimeline,
  isNight,
  DAY_COMFORT_H,
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

/** Typical time a celebration service occupies, by category. */
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

const KIND_LABEL: Record<TimelineKind, string> = {
  place: 'Places',
  service: 'Services',
  adventure: 'Adventures',
};

const fmtH = (h: number) => (h >= 1 ? `~${+h.toFixed(1)}h` : `~${Math.round(h * 60)}min`);
const entryKey = (e: CatalogEntry) => `${e.kind}:${e.refId}`;

type Feedback = { key: string; kind: 'ok' | 'warn' | 'error'; text: string };
const FEEDBACK_COLOR = { ok: '#1E7A3A', warn: '#B96212', error: '#C0392B' } as const;

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
 * Step 2 — Preferences: interests, then the trip timeline. Sightseeing and
 * adventures auto-sequence into daylight (till ~6 PM); celebrations take an
 * explicit day + time and may run at any hour. Items can also be dragged
 * from the list onto a day, or between days.
 */
export default function PreferencesStep() {
  const dispatch = useAppDispatch();
  const { interests, servicePrefs, timeline } = useAppSelector((s) => s.prefs);
  const days = useAppSelector(selectDays);

  const catalog = useMemo(buildCatalog, []);
  const [filter, setFilter] = useState<'all' | TimelineKind>('all');
  const [showTimeline, setShowTimeline] = useState(true);

  // Service add flow (day + time picker); places/adventures add instantly.
  const [addingService, setAddingService] = useState<CatalogEntry | null>(null);
  const [selDay, setSelDay] = useState('');
  const [selTime, setSelTime] = useState(SERVICE_TIME_OPTIONS[37]); // 6:30 PM

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [dropNote, setDropNote] = useState<{ day: string; text: string } | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);
  useEffect(() => {
    if (!dropNote) return;
    const t = setTimeout(() => setDropNote(null), 4000);
    return () => clearTimeout(t);
  }, [dropNote]);

  const shown = catalog.filter((e) => filter === 'all' || e.kind === filter);
  const noDates = days.length === 0;
  const dayNo = (day: string) => days.indexOf(day) + 1;

  const pushItem = (entry: CatalogEntry, day: string, startMin: number) => {
    dispatch(
      addTimelineItem({
        id: `${entry.kind}:${entry.refId}:${day}:${startMin}`,
        kind: entry.kind,
        refId: entry.refId,
        name: entry.name,
        day,
        startMin,
        durationH: entry.durationH,
        meta: entry.meta,
      }),
    );
    setShowTimeline(true);
  };

  /** Add button for places/adventures: pure sequence, no time to choose. */
  const addSequential = (entry: CatalogEntry) => {
    const slot = suggestDaylightSlot(timeline, days, entry.durationH);
    if (!slot) {
      setFeedback({
        key: entryKey(entry),
        kind: 'error',
        text: 'Every day is full before sunset — remove something or extend your dates.',
      });
      return;
    }
    pushItem(entry, slot.day, slot.startMin);
    setFeedback({
      key: entryKey(entry),
      kind: slot.packed ? 'warn' : 'ok',
      text: slot.packed
        ? `Added to Day ${dayNo(slot.day)} at ${minutesLabel(slot.startMin)} — that day is getting packed.`
        : `Added to Day ${dayNo(slot.day)} at ${minutesLabel(slot.startMin)}.`,
    });
  };

  const beginServiceAdd = (entry: CatalogEntry) => {
    const day = days[0];
    setAddingService(entry);
    setSelDay(day);
    setSelTime(nextServiceStart(timeline, day));
  };

  const confirmServiceAdd = () => {
    if (!addingService) return;
    pushItem(addingService, selDay, selTime);
    setFeedback({
      key: entryKey(addingService),
      kind: 'ok',
      text: `Added to Day ${dayNo(selDay)} at ${minutesLabel(selTime)}${isNight(selTime) ? ' (night celebration 🌙)' : ''}.`,
    });
    setAddingService(null);
  };

  // ---- Drag & drop -----------------------------------------------------------
  const onDropOnDay = (e: React.DragEvent, day: string) => {
    e.preventDefault();
    setDragOverDay(null);
    const itemId = e.dataTransfer.getData('application/x-timeline-item');
    if (itemId) {
      const it = timeline.find((i) => i.id === itemId);
      if (!it || it.day === day) return;
      const target = moveTarget(timeline, it, day);
      if (!target) {
        setDropNote({ day, text: `No room before sunset on Day ${dayNo(day)} — try another day.` });
        return;
      }
      dispatch(moveTimelineItem({ id: it.id, day, startMin: target.startMin }));
      return;
    }
    const key = e.dataTransfer.getData('application/x-catalog-entry');
    const entry = catalog.find((c) => entryKey(c) === key);
    if (!entry) return;
    if (entry.kind === 'service') {
      pushItem(entry, day, nextServiceStart(timeline, day));
    } else if (daylightFits(timeline, day, entry.durationH)) {
      pushItem(entry, day, nextDaylightStart(timeline, day));
    } else {
      setDropNote({ day, text: `No room before sunset on Day ${dayNo(day)} — try another day.` });
    }
  };

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
              : 'Sightseeing & adventures run till sunset (~6 PM) · celebrations can go late 🌙'}
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

      {/* Vertical day timelines — drop targets */}
      {showTimeline && !noDates && (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}
        >
          {days.map((day, i) => {
            const list = itemsOn(timeline, day);
            const dayH = daylightHours(timeline, day);
            const totalH = dayHours(timeline, day);
            const packed = dayH > DAY_COMFORT_H;
            const isOver = dragOverDay === day;
            return (
              <div
                key={day}
                data-tl-day={day}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverDay(day);
                }}
                onDragLeave={() => setDragOverDay((d) => (d === day ? null : d))}
                onDrop={(e) => onDropOnDay(e, day)}
                className="flex flex-col gap-2 rounded-[16px] border p-4 transition-colors"
                style={{
                  borderColor: isOver ? 'var(--accent)' : 'rgba(255,255,255,.1)',
                  background: isOver
                    ? 'color-mix(in srgb, var(--accent) 8%, transparent)'
                    : 'rgba(255,255,255,.03)',
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-serif text-[16px] font-bold text-white">Day {i + 1}</span>
                  <span className="text-[11.5px] text-white/55">{fmtDay(day)}</span>
                </div>
                <span
                  className="text-[11.5px] font-bold"
                  style={{ color: packed ? '#E8A87C' : 'rgba(255,255,255,.45)' }}
                >
                  {totalH > 0 ? `${totalH.toFixed(1)}h planned` : 'Nothing planned yet'}
                  {packed && ' · packed'}
                </span>

                {/* Vertical timeline */}
                <div className="flex flex-col">
                  {list.map((it, idx) => (
                    <div
                      key={it.id}
                      data-tl-item={it.id}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData('application/x-timeline-item', it.id)
                      }
                      className="group relative flex cursor-grab gap-3 active:cursor-grabbing"
                    >
                      {/* rail: dot + connector */}
                      <div className="flex w-7 flex-none flex-col items-center">
                        <span
                          className="flex h-7 w-7 flex-none items-center justify-center rounded-full border-[1.5px]"
                          style={{
                            borderColor: 'color-mix(in srgb, var(--accent) 55%, transparent)',
                            background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                            color: 'var(--accent)',
                          }}
                        >
                          <Icon
                            name={
                              it.kind === 'service'
                                ? isNight(it.startMin)
                                  ? 'moon'
                                  : 'sparkles'
                                : it.kind === 'adventure'
                                  ? 'mountain'
                                  : 'map-pin'
                            }
                            size={13}
                          />
                        </span>
                        {idx < list.length - 1 && (
                          <span className="my-1 w-px flex-1 bg-white/15" style={{ minHeight: 14 }} />
                        )}
                      </div>
                      {/* content */}
                      <div className="flex min-w-0 flex-1 flex-col pb-3.5">
                        <span
                          className="text-[10.5px] font-black tracking-[0.04em]"
                          style={{ color: 'var(--accent)' }}
                        >
                          {minutesLabel(it.startMin)}
                          {it.kind === 'service' && isNight(it.startMin) && ' · NIGHT'}
                        </span>
                        <span className="text-[13px] leading-tight font-bold text-white">
                          {it.name}{' '}
                          <span className="font-medium text-white/45">{fmtH(it.durationH)}</span>
                        </span>
                        <span className="truncate text-[11px] text-white/45">{it.meta}</span>
                      </div>
                      <div className="flex flex-none items-start gap-1.5 pt-1">
                        <Icon
                          name="grip-vertical"
                          size={14}
                          className="hidden text-white/25 md:block"
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${it.name}`}
                          onClick={() => dispatch(removeTimelineItem(it.id))}
                          className="cursor-pointer border-none bg-transparent p-0 text-white/40 hover:text-[#E8A87C]"
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {list.length === 0 && (
                    <span className="rounded-[10px] border border-dashed border-white/20 px-3 py-4 text-center text-[12px] text-white/40">
                      Drag items here, or use Add below
                    </span>
                  )}
                </div>

                {packed && (
                  <span
                    className="flex items-start gap-1.5 text-[11.5px] font-semibold"
                    style={{ color: '#E8A87C' }}
                  >
                    <Icon name="alert-triangle" size={13} className="mt-[1px] flex-none" />
                    Too many plans for one day — drag something to a day with room.
                  </span>
                )}
                {dropNote?.day === day && (
                  <span className="text-[11.5px] font-semibold" style={{ color: '#E8A87C' }}>
                    {dropNote.text}
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
              {f === 'all' ? `All (${catalog.length})` : KIND_LABEL[f]}
            </button>
          ))}
          <span className="hidden items-center gap-1 text-[11.5px] text-white/40 md:flex">
            <Icon name="hand-move" size={13} /> drag any row onto a day
          </span>
        </div>

        <div className="flex max-h-[560px] flex-col gap-2 overflow-y-auto pr-1">
          {shown.map((entry) => {
            const key = entryKey(entry);
            const isAdding = addingService ? entryKey(addingService) === key : false;
            return (
              <div
                key={key}
                draggable={!noDates}
                onDragStart={(e) => e.dataTransfer.setData('application/x-catalog-entry', key)}
                className="flex cursor-grab flex-col rounded-[14px] border-[1.5px] border-[#EBE1CF] bg-[#FAF7F2] px-3.5 py-2.5 active:cursor-grabbing"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Icon
                    name={entry.icon}
                    size={18}
                    style={{ color: 'var(--primary)' }}
                    className="flex-none"
                  />
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
                    onClick={() =>
                      entry.kind === 'service'
                        ? isAdding
                          ? setAddingService(null)
                          : beginServiceAdd(entry)
                        : addSequential(entry)
                    }
                  >
                    {isAdding ? 'Cancel' : 'Add'}
                  </Button>
                </div>

                {feedback?.key === key && (
                  <span
                    className="mt-1.5 text-[12px] font-semibold"
                    style={{ color: FEEDBACK_COLOR[feedback.kind] }}
                  >
                    {feedback.text}
                  </span>
                )}

                {isAdding && (
                  <div className="mt-2.5 flex flex-col gap-2 border-t border-[#EBE1CF] pt-2.5">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-muted text-[10px] font-black tracking-[0.05em] uppercase">Day</span>
                        <select
                          value={selDay}
                          onChange={(e) => {
                            setSelDay(e.target.value);
                            setSelTime(nextServiceStart(timeline, e.target.value));
                          }}
                          className="text-ink rounded-[10px] border border-[#DAD6CC] bg-white px-2.5 py-2 text-[13px] font-semibold outline-none"
                        >
                          {days.map((d, i) => (
                            <option key={d} value={d}>
                              Day {i + 1} · {fmtDay(d)}
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
                          {SERVICE_TIME_OPTIONS.map((t) => (
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
                        onClick={confirmServiceAdd}
                        startIcon={<Icon name="calendar-plus" size={15} />}
                      >
                        Add to Day {dayNo(selDay)}
                      </Button>
                    </div>
                    <span className="text-muted text-[12px]">
                      Celebrations can run at any hour — late night and early morning included.
                    </span>
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
          <Icon name="info-circle" size={16} /> All optional — sightseeing wraps by sunset,
          celebrations can go late.
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
