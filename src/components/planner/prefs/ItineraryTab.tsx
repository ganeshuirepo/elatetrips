'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  toggleInterest,
  addTimelineItem,
  removeTimelineItem,
  moveTimelineItem,
  setTimeline,
} from '@/store/slices/prefsSlice';
import { selectDays } from '@/store/selectors/planSelectors';
import {
  dayHours,
  daylightHours,
  itemsOn,
  placeOnDay,
  endsAfterSunset,
  nextServiceStart,
  suggestDaylightSlot,
  moveTarget,
  autoFillTimeline,
  DAY_COMFORT_H,
  type TimelineItem,
  type TimelineKind,
} from '@/domain/timeline';
import { OOTY_PLACES, PLACE_INTERESTS } from '@/data/ootyPlaces';
import { PLACE_IMAGES } from '@/data/placeImages';
import { CELEBRATIONS } from '@/data/celebrations';
import { ADVENTURES, EXPERIENCES } from '@/data/activities';
import { fmtDay } from '@/domain/format';
import Icon from '@/components/ui/Icon';

/** Sections shown in the details popup. */
interface EntryDetail {
  itinerary?: string[];
  inclusions?: string[];
  exclusions?: string[];
  highlights?: string[];
  facts?: { label: string; value: string }[];
  tip?: string;
}

/** One addable row in the catalog — a place, a service or an adventure. */
interface CatalogEntry {
  kind: TimelineKind;
  refId: string;
  name: string;
  meta: string;
  durationH: number;
  icon: string;
  /** Interest tags (places & adventures) — matched against the chips above. */
  tags?: string[];
  /** Service category id — matched against the service-preference chips. */
  catId?: string;
  images?: string[];
  description?: string;
  detail?: EntryDetail;
}

/** Placeholder gradients for entries without photos (places, adventures). */
const TILE_GRADIENTS = [
  'linear-gradient(135deg, #1f4a44, #c9a45a)',
  'linear-gradient(135deg, #2b5c54, #e7c572)',
  'linear-gradient(135deg, #394f39, #bfa15a)',
  'linear-gradient(135deg, #4a3f2f, #d4a94f)',
  'linear-gradient(135deg, #143a3c, #9c7c33)',
];
const tileGradient = (id: string) => TILE_GRADIENTS[id.charCodeAt(id.length - 1) % TILE_GRADIENTS.length];

/** Service categories that belong to escapes rather than celebrations. */
const ESCAPE_CATS = ['wellness', 'adventure', 'local'];

const OCCASION_CATEGORY = Object.fromEntries(CELEBRATIONS.map((c) => [c.id, c.category]));

function buildCatalog(): CatalogEntry[] {
  const places: CatalogEntry[] = OOTY_PLACES.map((p) => ({
    kind: 'place',
    refId: p.id,
    name: p.name,
    meta: `${p.distanceKm} km · ${p.fee}`,
    durationH: p.durationH,
    icon: 'map-pin',
    tags: p.tags,
    images: PLACE_IMAGES[p.id],
    description: p.bestTime,
    detail: {
      highlights: p.highlights,
      facts: [
        { label: 'Timings', value: p.timings },
        { label: 'Entry', value: p.fee },
        { label: 'Distance', value: `${p.distanceKm} km from Ooty` },
        { label: 'Best time', value: p.bestTime },
      ],
      tip: p.tip,
    },
  }));

  // Celebration services are picked on the hotel detail, not here — the
  // itinerary list carries places and adventures only; the occasions
  // themselves land on the timeline from the Plan popup.
  const adventures: CatalogEntry[] = [
    ...ADVENTURES.map((v) => ({
      kind: 'adventure' as const,
      refId: `adv:${v.id}`,
      name: v.name,
      meta: `${v.sub} · ₹${v.price.toLocaleString('en-IN')}/person`,
      durationH: 2.5,
      icon: v.icon,
      tags: ['adventure'],
      description: v.sub,
      detail: { inclusions: v.inc, facts: [{ label: 'Price', value: `₹${v.price.toLocaleString('en-IN')} per person` }] },
    })),
    ...EXPERIENCES.map((v) => ({
      kind: 'adventure' as const,
      refId: `exp:${v.id}`,
      name: v.name,
      meta: `${v.sub} · ₹${v.price.toLocaleString('en-IN')}/person`,
      durationH: 2,
      icon: v.icon,
      tags: ['adventure', 'heritage'],
      description: v.sub,
      detail: { inclusions: v.inc, facts: [{ label: 'Price', value: `₹${v.price.toLocaleString('en-IN')} per person` }] },
    })),
  ];

  return [...places, ...adventures];
}

const fmtH = (h: number) => (h >= 1 ? `~${+h.toFixed(1)}h` : `~${Math.round(h * 60)}min`);
const entryKey = (e: CatalogEntry) => `${e.kind}:${e.refId}`;


/** Tile thumbnail with the Surprises-style mini carousel (arrows + dots). */
function TileThumb({ entry }: { entry: CatalogEntry }) {
  const images = entry.images ?? [];
  const [idx, setIdx] = useState(0);
  const step = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIdx((i) => (i + delta + images.length) % images.length);
  };
  if (images.length === 0)
    return (
      <span
        className="flex h-[60px] w-[84px] flex-none items-center justify-center rounded-[10px] text-white/85"
        style={{ background: tileGradient(entry.refId) }}
      >
        <Icon name={entry.icon} size={22} />
      </span>
    );
  return (
    <div className="group/thumb relative h-[60px] w-[84px] flex-none overflow-hidden rounded-[10px] bg-black/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[idx]} alt={entry.name} className="h-full w-full object-cover" />
      {images.length > 1 && (
        <>
          <span
            role="button"
            tabIndex={-1}
            aria-label="Previous image"
            onClick={step(-1)}
            className="absolute top-1/2 left-0.5 flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100"
          >
            <Icon name="chevron-left" size={11} />
          </span>
          <span
            role="button"
            tabIndex={-1}
            aria-label="Next image"
            onClick={step(1)}
            className="absolute top-1/2 right-0.5 flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100"
          >
            <Icon name="chevron-right" size={11} />
          </span>
          <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
            {images.map((src, i) => (
              <span
                key={src}
                className="h-1 rounded-full transition-all"
                style={{ width: i === idx ? 8 : 4, background: i === idx ? '#fff' : 'rgba(255,255,255,.6)' }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** A titled block inside the details modal. */
function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-accent-ink text-[11px] font-black tracking-[0.06em] uppercase">
        {title}
      </span>
      {children}
    </div>
  );
}

/** Details popup — mirrors the Surprises step's package modal. */
function CatalogDetailsModal({
  entry,
  onAdd,
  onClose,
}: {
  entry: CatalogEntry;
  onAdd: () => void;
  onClose: () => void;
}) {
  const d = entry.detail ?? {};
  const hero = entry.images?.[0];
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
          {hero ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={hero} alt={entry.name} className="h-40 w-full object-cover" />
          ) : (
            <div
              className="flex h-40 w-full items-center justify-center text-white/85"
              style={{ background: tileGradient(entry.refId) }}
            >
              <Icon name={entry.icon} size={44} />
            </div>
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
              <Icon name={entry.icon} size={18} className="text-ink/70" />
              <h2 className="text-ink m-0 font-serif text-[20px] font-bold">{entry.name}</h2>
            </div>
            {entry.description && <p className="text-ink/60 m-0 text-[13px]">{entry.description}</p>}
            <span className="text-ink text-[13px] font-extrabold">
              {entry.meta}
              <span className="text-ink/45 ml-2 text-[11px] font-medium">
                <Icon name="clock" size={11} /> {fmtH(entry.durationH)}
              </span>
            </span>
          </div>

          {d.facts && d.facts.length > 0 && (
            <DetailBlock title="Good to know">
              <div className="flex flex-col gap-1">
                {d.facts.map((f) => (
                  <div key={f.label} className="flex gap-2 text-[13px]">
                    <span className="text-ink/50 w-[84px] flex-none font-semibold">{f.label}</span>
                    <span className="text-ink/85">{f.value}</span>
                  </div>
                ))}
              </div>
            </DetailBlock>
          )}

          {d.highlights && d.highlights.length > 0 && (
            <DetailBlock title="Things to do">
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {d.highlights.map((s) => (
                  <li key={s} className="text-ink/80 flex items-start gap-2 text-[13px]">
                    <Icon name="point" size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--accent-ink)' }} />
                    {s}
                  </li>
                ))}
              </ul>
            </DetailBlock>
          )}

          {d.itinerary && d.itinerary.length > 0 && (
            <DetailBlock title="Itinerary">
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {d.itinerary.map((s, i) => (
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
          )}

          {d.inclusions && d.inclusions.length > 0 && (
            <DetailBlock title="Inclusions">
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {d.inclusions.map((s) => (
                  <li key={s} className="text-ink/80 flex items-start gap-2 text-[13px]">
                    <Icon name="circle-check" size={16} className="mt-0.5 shrink-0" style={{ color: '#1E9E6A' }} />
                    {s}
                  </li>
                ))}
              </ul>
            </DetailBlock>
          )}

          {d.exclusions && d.exclusions.length > 0 && (
            <DetailBlock title="Exclusions">
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {d.exclusions.map((s) => (
                  <li key={s} className="text-ink/80 flex items-start gap-2 text-[13px]">
                    <Icon name="circle-x" size={16} className="mt-0.5 shrink-0" style={{ color: '#C0392B' }} />
                    {s}
                  </li>
                ))}
              </ul>
            </DetailBlock>
          )}

          {d.tip && (
            <p className="m-0 text-[13px] font-semibold" style={{ color: 'var(--accent-ink)' }}>
              Tip: {d.tip}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#EBE1CF] p-4">
          <Button variant="text" onClick={onClose} sx={{ color: 'var(--ink)', fontWeight: 700 }}>
            Close
          </Button>
          <Button
            variant="contained"
            onClick={onAdd}
            startIcon={<Icon name="calendar-plus" size={16} />}
            sx={{
              background: 'linear-gradient(180deg,#e9c97f,#d4a94f)',
              color: '#08201f',
              fontWeight: 800,
              boxShadow: 'none',
              '&:hover': { background: 'linear-gradient(180deg,#edd089,#d9af55)', boxShadow: 'none' },
            }}
          >
            Add to timeline
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Compact multi-select filter chip shared by both preference groups. */
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
      className="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors"
      style={{
        background: active ? 'var(--accent)' : 'rgba(255,255,255,.06)',
        borderColor: active ? 'var(--accent)' : 'rgba(255,255,255,.22)',
        color: active ? '#08201F' : 'rgba(255,255,255,.8)',
      }}
    >
      <Icon name={icon} size={13} />
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
  onPickDay: (d: string) => void;
  onConfirmService: () => void;
  onCancelService: () => void;
  onBeginService: (e: CatalogEntry) => void;
  onAddSequential: (e: CatalogEntry) => void;
  onShowDetails: (e: CatalogEntry) => void;
}

/** A scrollable list of addable entries, driven purely by the preference chips. */
function CatalogPanel({
  title,
  sub,
  entries,
  emptyMessage,
  shared,
}: {
  title: string;
  sub: string;
  entries: CatalogEntry[];
  emptyMessage: string;
  shared: PanelShared;
}) {
  const list = entries;
  const {
    noDates,
    days,
    addingService,
    selDay,
    onPickDay,
    onConfirmService,
    onCancelService,
    onBeginService,
    onAddSequential,
    onShowDetails,
  } = shared;

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[16px] border border-white/10 bg-white/[0.03] p-3.5">
      <div className="flex flex-col">
        <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">{title}</span>
        <span className="text-[11.5px] text-white/50">{sub}</span>
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
              <div className="flex items-center gap-3">
                {/* Photo carousel (Surprises-style) or branded placeholder */}
                <TileThumb entry={entry} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-ink truncate text-[13px] leading-tight font-bold">{entry.name}</span>
                  <span className="text-muted truncate text-[11px]">
                    {entry.meta} · <Icon name="clock" size={10} /> {fmtH(entry.durationH)}
                  </span>
                </div>
                <div className="flex flex-none items-center gap-1.5">
                  <Button
                    size="small"
                    variant="outlined"
                    color="primary"
                    sx={{ minWidth: 0, px: 1.2 }}
                    onClick={() => onShowDetails(entry)}
                    startIcon={<Icon name="list-details" size={13} />}
                  >
                    Details
                  </Button>
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
                        {days.map((d) => (
                          <option key={d} value={d}>
                            {fmtDay(d)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button size="small" variant="contained" color="primary" onClick={onConfirmService}>
                      Add
                    </Button>
                  </div>
                  <span className="text-muted text-[11.5px]">
                    Celebrations run in the evening after the day&apos;s sightseeing.
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <span className="rounded-[10px] border border-dashed border-white/20 px-3 py-6 text-center text-[12.5px] text-white/45">
            {emptyMessage}
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
export default function ItineraryTab() {
  const dispatch = useAppDispatch();
  const { interests, timeline } = useAppSelector((s) => s.prefs);
  const days = useAppSelector(selectDays);
  const celebs = useAppSelector((s) => s.plan.celebs);

  // What the trip is actually about — hides irrelevant chips and list items.
  const hasCelebration = celebs.some((id) => OCCASION_CATEGORY[id] !== 'rejuvenate');
  const hasEscapes = celebs.some((id) => OCCASION_CATEGORY[id] === 'rejuvenate');

  const catalog = useMemo(buildCatalog, []);
  const noDates = days.length === 0;
  const dayNo = (day: string) => days.indexOf(day) + 1;
  /** Compact date label for buttons/dropdowns, e.g. "24 Dec". */
  const shortDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  // Selected day shown in the middle timeline panel.
  const [selectedDay, setSelectedDay] = useState('');
  const activeDay = days.includes(selectedDay) ? selectedDay : (days[0] ?? '');
  const dayStripRef = useRef<HTMLDivElement>(null);

  // Service add flow (day picker; the evening slot is assigned automatically).
  const [addingService, setAddingService] = useState<CatalogEntry | null>(null);
  const [selDay, setSelDay] = useState('');
  // Details popup (like the Surprises step's package modal).
  const [detailsEntry, setDetailsEntry] = useState<CatalogEntry | null>(null);

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

  /** Items only make sense for the occasions chosen on the Plan step. */
  const matchesOccasions = (e: CatalogEntry) => {
    if (e.kind === 'place') return true;
    if (e.kind === 'adventure') return hasEscapes;
    return ESCAPE_CATS.includes(e.catId ?? '') ? hasEscapes : hasCelebration;
  };

  /**
   * Places follow the interest chips (nothing selected → empty list with a
   * nudge); services need no chips — the occasion gating above decides them.
   */
  const hasAnyPref = interests.length > 0;
  const matchesPrefs = (e: CatalogEntry) => {
    if (e.kind === 'service') return true;
    return (e.tags ?? []).some((t) => interests.includes(t));
  };
  const available = catalog.filter((e) => !onTimeline(e) && matchesOccasions(e) && matchesPrefs(e));

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
        ? `Won't fit before sunset — added to ${shortDate(slot.day)}, but most places will be closed. Consider freeing up an earlier slot.`
        : slot.packed
          ? `Added to ${shortDate(slot.day)} — that day is overloaded.`
          : null,
    );
  };

  const beginServiceAdd = (entry: CatalogEntry) => {
    setAddingService(entry);
    setSelDay(activeDay || days[0]);
  };

  const confirmServiceAdd = () => {
    if (!addingService) return;
    pushItem(addingService, selDay, nextServiceStart(timeline, selDay));
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
        setDropNote(`Moved after sunset on ${shortDate(day)} — most places will be closed then.`);
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
        setDropNote(`Added after sunset on ${shortDate(day)} — most places will be closed then.`);
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
    onPickDay: setSelDay,
    onConfirmService: confirmServiceAdd,
    onCancelService: () => setAddingService(null),
    onBeginService: beginServiceAdd,
    onAddSequential: addSequential,
    onShowDetails: setDetailsEntry,
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
              {days.map((d) => {
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
                    {shortDate(d)}
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
                                ? 'sparkles'
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
                        <span className="text-[13px] leading-tight font-bold text-white">
                          {it.name} <span className="font-medium text-white/45">{fmtH(it.durationH)}</span>
                        </span>
                        <span className="truncate text-[11px] text-white/45">{it.meta}</span>
                        {endsAfterSunset(it) && (
                          <span className="flex items-center gap-1 text-[10.5px] font-semibold" style={{ color: '#E8A87C' }}>
                            <Icon name="alert-triangle" size={11} /> Won&apos;t fit before sunset — this place may be closed
                          </span>
                        )}
                      </div>
                      <div className="flex flex-none items-center gap-1.5 pt-1">
                        {/* Move to another day — the no-drag way */}
                        <select
                          value={it.day}
                          aria-label={`Move ${it.name} to another day`}
                          onChange={(e) => {
                            const toDay = e.target.value;
                            if (toDay === it.day) return;
                            const target = moveTarget(timeline, it, toDay);
                            dispatch(moveTimelineItem({ id: it.id, day: toDay, startMin: target.startMin }));
                            setSelectedDay(toDay);
                            if (target.late)
                              setDropNote(
                                `Won't fit before sunset on ${shortDate(toDay)} — this place may be closed.`,
                              );
                          }}
                          className="cursor-pointer rounded-md border border-white/25 bg-transparent py-0.5 pl-1 text-[10.5px] font-bold text-white/75 outline-none"
                        >
                          {days.map((d) => (
                            <option key={d} value={d} style={{ color: '#08201F', background: '#fff' }}>
                              {shortDate(d)}
                            </option>
                          ))}
                        </select>
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

  return (
    <div className="flex flex-col gap-5">
      {/* Interests */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
            What are you into?
          </span>
          <span className="text-[12.5px] text-white/55">Filters the list below & guides the auto-planner</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PLACE_INTERESTS.filter((i) => i.id !== 'adventure' || hasEscapes).map((i) => (
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

      {/* Planning board: list + timeline. Two columns on desktop, stacked
          (timeline first) on phones. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="order-2 lg:order-1">
          <CatalogPanel
            title="Places & adventures"
            sub="Matches your preferences above · sightseeing till sunset, celebrations any hour"
            entries={available}
            emptyMessage={
              hasAnyPref
                ? 'Everything matching your preferences is already on your timeline.'
                : 'Add your interests above to plan the itinerary.'
            }
            shared={panelShared}
          />
        </div>
        <div className="order-1 lg:order-2">{timelinePanel}</div>
      </div>

      {/* Details popup */}
      {detailsEntry && (
        <CatalogDetailsModal
          entry={detailsEntry}
          onClose={() => setDetailsEntry(null)}
          onAdd={() => {
            const entry = detailsEntry;
            setDetailsEntry(null);
            if (entry.kind === 'service') beginServiceAdd(entry);
            else addSequential(entry);
          }}
        />
      )}

    </div>
  );
}
