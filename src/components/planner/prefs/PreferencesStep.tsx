'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  placeOnDay,
  endsAfterSunset,
  nextServiceStart,
  suggestDaylightSlot,
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
  /** Service category (filter pills in the services panel). */
  catLabel?: string;
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
        catLabel: cat.label,
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

const fmtH = (h: number) => (h >= 1 ? `~${+h.toFixed(1)}h` : `~${Math.round(h * 60)}min`);
const entryKey = (e: CatalogEntry) => `${e.kind}:${e.refId}`;


/** Small filter pill used inside the panels. */
function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className="flex-none cursor-pointer rounded-full border-[1.5px] px-3 py-1 text-[12px] font-semibold whitespace-nowrap transition-colors"
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

interface PanelShared {
  noDates: boolean;
  days: string[];
  timeline: TimelineItem[];
  addingService: CatalogEntry | null;
  selDay: string;
  selTime: number;
  onPickDay: (d: string) => void;
  onPickTime: (t: number) => void;
  onConfirmService: () => void;
  onCancelService: () => void;
  onBeginService: (e: CatalogEntry) => void;
  onAddSequential: (e: CatalogEntry) => void;
}

/** A filterable, scrollable list of addable entries (left/right panels). */
function CatalogPanel({
  title,
  sub,
  entries,
  filters,
  shared,
}: {
  title: string;
  sub: string;
  entries: CatalogEntry[];
  filters: { id: string; label: string; match: (e: CatalogEntry) => boolean }[];
  shared: PanelShared;
}) {
  const [f, setF] = useState('all');
  const act = filters.find((x) => x.id === f) ?? filters[0];
  const list = entries.filter(act.match);
  const {
    noDates,
    days,
    addingService,
    selDay,
    selTime,
    onPickDay,
    onPickTime,
    onConfirmService,
    onCancelService,
    onBeginService,
    onAddSequential,
  } = shared;

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[16px] border border-white/10 bg-white/[0.03] p-3.5">
      <div className="flex flex-col">
        <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">{title}</span>
        <span className="text-[11.5px] text-white/50">{sub}</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {filters.map((x) => (
          <Pill key={x.id} label={x.label} active={f === x.id} onClick={() => setF(x.id)} />
        ))}
      </div>
      <div className="flex max-h-[430px] flex-col gap-1.5 overflow-y-auto pr-1">
        {list.map((entry) => {
          const key = entryKey(entry);
          const isAdding = addingService ? entryKey(addingService) === key : false;
          return (
            <div
              key={key}
              draggable={!noDates}
              onDragStart={(e) => e.dataTransfer.setData('application/x-catalog-entry', key)}
              className="flex cursor-grab flex-col rounded-[12px] border-[1.5px] border-[#EBE1CF] bg-[#FAF7F2] px-3 py-2 active:cursor-grabbing"
            >
              <div className="flex items-center gap-2.5">
                <Icon name={entry.icon} size={16} style={{ color: 'var(--primary)' }} className="flex-none" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-ink truncate text-[13px] leading-tight font-bold">{entry.name}</span>
                  <span className="text-muted truncate text-[11px]">
                    {entry.meta} · <Icon name="clock" size={10} /> {fmtH(entry.durationH)}
                  </span>
                </div>
                <Button
                  size="small"
                  variant={isAdding ? 'outlined' : 'contained'}
                  color="primary"
                  disabled={noDates}
                  sx={{ minWidth: 52, px: 1 }}
                  onClick={() =>
                    entry.kind === 'service'
                      ? isAdding
                        ? onCancelService()
                        : onBeginService(entry)
                      : onAddSequential(entry)
                  }
                >
                  {isAdding ? 'Cancel' : 'Add'}
                </Button>
              </div>

              {isAdding && (
                <div className="mt-2 flex flex-col gap-2 border-t border-[#EBE1CF] pt-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-muted text-[10px] font-black tracking-[0.05em] uppercase">Day</span>
                      <select
                        value={selDay}
                        onChange={(e) => onPickDay(e.target.value)}
                        className="text-ink rounded-[10px] border border-[#DAD6CC] bg-white px-2 py-1.5 text-[12.5px] font-semibold outline-none"
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
                        onChange={(e) => onPickTime(Number(e.target.value))}
                        className="text-ink rounded-[10px] border border-[#DAD6CC] bg-white px-2 py-1.5 text-[12.5px] font-semibold outline-none"
                      >
                        {SERVICE_TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {minutesLabel(t)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button size="small" variant="contained" color="primary" onClick={onConfirmService}>
                      Add
                    </Button>
                  </div>
                  <span className="text-muted text-[11.5px]">
                    Celebrations can run at any hour — late night included.
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <span className="px-2 py-4 text-center text-[12px] text-white/40">
            Everything here is already on your timeline.
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Step 2 — Preferences. The planning board: places & adventures on the left,
 * one-day-at-a-time vertical timeline in the middle (day buttons + arrows),
 * celebration services on the right. Items already on the timeline leave the
 * lists; on phones the two lists merge into one filterable panel.
 */
export default function PreferencesStep() {
  const dispatch = useAppDispatch();
  const { interests, servicePrefs, timeline } = useAppSelector((s) => s.prefs);
  const days = useAppSelector(selectDays);

  const catalog = useMemo(buildCatalog, []);
  const noDates = days.length === 0;
  const dayNo = (day: string) => days.indexOf(day) + 1;

  // Selected day shown in the middle timeline panel.
  const [selectedDay, setSelectedDay] = useState('');
  const activeDay = days.includes(selectedDay) ? selectedDay : (days[0] ?? '');
  const dayStripRef = useRef<HTMLDivElement>(null);

  // Service add flow (day + time picker); places/adventures add instantly.
  const [addingService, setAddingService] = useState<CatalogEntry | null>(null);
  const [selDay, setSelDay] = useState('');
  const [selTime, setSelTime] = useState(SERVICE_TIME_OPTIONS[37]); // 6:30 PM

  const [dragOver, setDragOver] = useState<string | null>(null); // day being hovered
  const [dropNote, setDropNote] = useState<string | null>(null);

  useEffect(() => {
    if (!dropNote) return;
    const t = setTimeout(() => setDropNote(null), 6000);
    return () => clearTimeout(t);
  }, [dropNote]);

  /** Items already planned disappear from the lists until removed. */
  const onTimeline = (e: CatalogEntry) =>
    timeline.some((i) => i.kind === e.kind && i.refId === e.refId);
  const available = catalog.filter((e) => !onTimeline(e));

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
    setSelectedDay(day);
  };

  /** Add button for places/adventures: pure sequence, warnings never blocks. */
  const addSequential = (entry: CatalogEntry) => {
    const slot = suggestDaylightSlot(timeline, days, entry.durationH);
    pushItem(entry, slot.day, slot.startMin);
    setDropNote(
      slot.late
        ? `Added to Day ${dayNo(slot.day)} after sunset — most places will be closed. Consider freeing up an earlier slot.`
        : slot.packed
          ? `Added to Day ${dayNo(slot.day)} at ${minutesLabel(slot.startMin)} — that day is overloaded.`
          : null,
    );
  };

  const beginServiceAdd = (entry: CatalogEntry) => {
    const day = activeDay || days[0];
    setAddingService(entry);
    setSelDay(day);
    setSelTime(nextServiceStart(timeline, day));
  };

  const confirmServiceAdd = () => {
    if (!addingService) return;
    pushItem(addingService, selDay, selTime);
    setAddingService(null);
  };

  // ---- Drag & drop -----------------------------------------------------------
  const handleDrop = (e: React.DragEvent, day: string) => {
    e.preventDefault();
    setDragOver(null);
    const itemId = e.dataTransfer.getData('application/x-timeline-item');
    if (itemId) {
      const it = timeline.find((i) => i.id === itemId);
      if (!it || it.day === day) return;
      const target = moveTarget(timeline, it, day);
      dispatch(moveTimelineItem({ id: it.id, day, startMin: target.startMin }));
      setSelectedDay(day);
      if (target.late)
        setDropNote(`Moved after sunset on Day ${dayNo(day)} — most places will be closed then.`);
      return;
    }
    const key = e.dataTransfer.getData('application/x-catalog-entry');
    const entry = catalog.find((c) => entryKey(c) === key);
    if (!entry) return;
    if (entry.kind === 'service') {
      pushItem(entry, day, nextServiceStart(timeline, day));
    } else {
      const spot = placeOnDay(timeline, day, entry.durationH);
      pushItem(entry, day, spot.startMin);
      if (spot.late)
        setDropNote(`Added after sunset on Day ${dayNo(day)} — most places will be closed then.`);
    }
  };
  const dropProps = (day: string) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(day);
    },
    onDragLeave: () => setDragOver((d) => (d === day ? null : d)),
    onDrop: (e: React.DragEvent) => handleDrop(e, day),
  });

  const panelShared = {
    noDates,
    days,
    timeline,
    addingService,
    selDay,
    selTime,
    onPickDay: (d: string) => {
      setSelDay(d);
      setSelTime(nextServiceStart(timeline, d));
    },
    onPickTime: setSelTime,
    onConfirmService: confirmServiceAdd,
    onCancelService: () => setAddingService(null),
    onBeginService: beginServiceAdd,
    onAddSequential: addSequential,
  };

  // ---- Timeline panel (middle column) ------------------------------------------
  const timelinePanel = (
    <div className="flex min-w-0 flex-col gap-2 rounded-[16px] border border-white/10 bg-white/[0.03] p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
          Timeline ({timeline.length})
        </span>
        {!noDates && (
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              dispatch(setTimeline(autoFillTimeline(days, interests)));
            }}
            startIcon={<Icon name="wand" size={14} />}
            sx={{ color: 'rgba(255,255,255,.85)', borderColor: 'rgba(255,255,255,.3)', py: 0.2 }}
          >
            Auto-plan
          </Button>
        )}
      </div>

      {noDates ? (
        <span className="px-2 py-6 text-center text-[12.5px] text-white/50">
          Pick your tour dates on the Plan step to start the timeline.
        </span>
      ) : (
        <>
          {/* Day switcher: arrows + scrollable day buttons (drop targets too) */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Previous day"
              disabled={dayNo(activeDay) <= 1}
              onClick={() => setSelectedDay(days[Math.max(0, dayNo(activeDay) - 2)])}
              className="flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-full border border-white/25 bg-transparent text-white/75 disabled:opacity-30"
            >
              <Icon name="chevron-left" size={15} />
            </button>
            <div ref={dayStripRef} className="flex flex-1 gap-1.5 overflow-x-auto pb-0.5">
              {days.map((d, i) => {
                const active = d === activeDay;
                return (
                  <button
                    key={d}
                    type="button"
                    {...dropProps(d)}
                    onClick={() => setSelectedDay(d)}
                    className="flex-none cursor-pointer rounded-full border-[1.5px] px-3 py-1 text-[12px] font-bold whitespace-nowrap transition-colors"
                    style={{
                      background: active || dragOver === d ? 'var(--accent)' : 'transparent',
                      borderColor: active || dragOver === d ? 'var(--accent)' : 'rgba(255,255,255,.25)',
                      color: active || dragOver === d ? '#08201F' : 'rgba(255,255,255,.8)',
                    }}
                  >
                    Day {i + 1}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              aria-label="Next day"
              disabled={dayNo(activeDay) >= days.length}
              onClick={() => setSelectedDay(days[Math.min(days.length - 1, dayNo(activeDay))])}
              className="flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-full border border-white/25 bg-transparent text-white/75 disabled:opacity-30"
            >
              <Icon name="chevron-right" size={15} />
            </button>
          </div>

          {/* Selected day's vertical timeline (drop target) */}
          {(() => {
            const day = activeDay;
            const list = itemsOn(timeline, day);
            const packed = daylightHours(timeline, day) > DAY_COMFORT_H;
            const totalH = dayHours(timeline, day);
            const isOver = dragOver === day;
            return (
              <div
                {...dropProps(day)}
                data-tl-day={day}
                className="flex min-h-[220px] flex-col gap-2 rounded-[12px] border p-3 transition-colors"
                style={{
                  borderColor: isOver ? 'var(--accent)' : 'rgba(255,255,255,.12)',
                  background: isOver ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-bold text-white/80">{fmtDay(day)}</span>
                  <span className="text-[11.5px] font-bold" style={{ color: packed ? '#E8A87C' : 'rgba(255,255,255,.45)' }}>
                    {totalH > 0 ? `${totalH.toFixed(1)}h planned` : 'Nothing yet'}
                    {packed && ' · packed'}
                  </span>
                </div>

                <div className="flex max-h-[360px] flex-col overflow-y-auto pr-1">
                  {list.map((it, idx) => (
                    <div
                      key={it.id}
                      data-tl-item={it.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('application/x-timeline-item', it.id)}
                      className="relative flex cursor-grab gap-3 active:cursor-grabbing"
                    >
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
                          <span className="my-1 w-px flex-1 bg-white/15" style={{ minHeight: 12 }} />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col pb-3">
                        <span className="flex items-center gap-1.5">
                          {/* Editable start time — interchange slots freely */}
                          <select
                            value={it.startMin}
                            onChange={(e) =>
                              dispatch(
                                moveTimelineItem({
                                  id: it.id,
                                  day: it.day,
                                  startMin: Number(e.target.value),
                                }),
                              )
                            }
                            className="cursor-pointer rounded-md border-none py-0.5 pr-0.5 pl-1 text-[10.5px] font-black tracking-[0.04em] outline-none"
                            style={{
                              background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
                              color: 'var(--accent)',
                            }}
                          >
                            {SERVICE_TIME_OPTIONS.map((t) => (
                              <option key={t} value={t} style={{ color: '#08201F', background: '#fff' }}>
                                {minutesLabel(t)}
                              </option>
                            ))}
                          </select>
                          {it.kind === 'service' && isNight(it.startMin) && (
                            <span className="text-[10px] font-black text-white/50">NIGHT</span>
                          )}
                        </span>
                        <span className="text-[13px] leading-tight font-bold text-white">
                          {it.name} <span className="font-medium text-white/45">{fmtH(it.durationH)}</span>
                        </span>
                        <span className="truncate text-[11px] text-white/45">{it.meta}</span>
                        {endsAfterSunset(it) && (
                          <span className="flex items-center gap-1 text-[10.5px] font-semibold" style={{ color: '#E8A87C' }}>
                            <Icon name="alert-triangle" size={11} /> After sunset — this place may be closed
                          </span>
                        )}
                      </div>
                      <div className="flex flex-none items-start gap-1.5 pt-1">
                        <Icon name="grip-vertical" size={14} className="hidden text-white/25 md:block" />
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
                    <span className="rounded-[10px] border border-dashed border-white/20 px-3 py-6 text-center text-[12px] text-white/40">
                      Drag items here — or use Add and we&apos;ll slot them in sequence.
                    </span>
                  )}
                </div>

                {packed && (
                  <span className="flex items-start gap-1.5 text-[11.5px] font-semibold" style={{ color: '#E8A87C' }}>
                    <Icon name="alert-triangle" size={13} className="mt-[1px] flex-none" />
                    Too many plans for this day — drag something onto another day button.
                  </span>
                )}
                {dropNote && (
                  <span className="text-[11.5px] font-semibold" style={{ color: '#E8A87C' }}>
                    {dropNote}
                  </span>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );

  const placeFilters = [
    { id: 'all', label: 'All', match: () => true },
    { id: 'place', label: 'Places', match: (e: CatalogEntry) => e.kind === 'place' },
    { id: 'adventure', label: 'Adventures', match: (e: CatalogEntry) => e.kind === 'adventure' },
  ];
  const serviceCats = [...new Set(available.filter((e) => e.kind === 'service').map((e) => e.catLabel!))];
  const serviceFilters = [
    { id: 'all', label: 'All', match: () => true },
    ...serviceCats.map((c) => ({ id: c, label: c, match: (e: CatalogEntry) => e.catLabel === c })),
  ];
  const combinedFilters = [
    { id: 'all', label: 'All', match: () => true },
    { id: 'place', label: 'Places', match: (e: CatalogEntry) => e.kind === 'place' },
    { id: 'service', label: 'Services', match: (e: CatalogEntry) => e.kind === 'service' },
    { id: 'adventure', label: 'Adventures', match: (e: CatalogEntry) => e.kind === 'adventure' },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Heading */}
      <div className="flex flex-col gap-1">
        <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
          Preferences
        </span>
        <span className="text-[13px] text-white/60">
          Tell us what you love, then build your day-by-day timeline — sightseeing wraps by sunset,
          celebrations can go late 🌙
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

      {/* Planning board: desktop = 3 columns; mobile = timeline + combined list */}
      <div className="hidden gap-4 lg:grid" style={{ gridTemplateColumns: '1fr 1.15fr 1fr' }}>
        <CatalogPanel
          title="Places & adventures"
          sub="Daylight only — till ~6 PM · drag onto a day or Add"
          entries={available.filter((e) => e.kind !== 'service')}
          filters={placeFilters}
          shared={panelShared}
        />
        {timelinePanel}
        <CatalogPanel
          title="Celebration services"
          sub="Any hour — late night included"
          entries={available.filter((e) => e.kind === 'service')}
          filters={serviceFilters}
          shared={panelShared}
        />
      </div>
      <div className="flex flex-col gap-4 lg:hidden">
        {timelinePanel}
        <CatalogPanel
          title="Places & services"
          sub="Sightseeing till sunset · celebrations any hour"
          entries={available}
          filters={combinedFilters}
          shared={panelShared}
        />
      </div>

      {/* Action bar */}
      <div
        className="sticky bottom-0 z-30 flex flex-col gap-2 border-t border-white/15 py-3 backdrop-blur-md"
        style={{ background: 'color-mix(in srgb, var(--bg2) 82%, transparent)' }}
      >
        <span className="flex items-center gap-2 text-[13px] text-white/65">
          <Icon name="info-circle" size={16} /> All optional — added items leave the lists and come
          back if you remove them.
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
