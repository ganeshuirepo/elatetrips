'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import {
  toggleInterest,
  toggleServicePref,
  setItinerary,
} from '@/store/slices/prefsSlice';
import { selectDays } from '@/store/selectors/planSelectors';
import { buildItinerary } from '@/domain/itinerary';
import { OOTY_PLACES, PLACE_INTERESTS, SERVICE_PREFS, type OotyPlace } from '@/data/ootyPlaces';
import { fmtDay } from '@/domain/format';
import { GOLD_BUTTON } from '@/components/planner/goldButton';
import Icon from '@/components/ui/Icon';

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

/** Compact place card with an expandable details footer. */
function PlaceCard({ place }: { place: OotyPlace }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col rounded-[14px] border-[1.5px] border-[#EBE1CF] bg-[#FAF7F2] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-ink text-[14px] leading-tight font-bold">{place.name}</span>
          <span className="text-muted text-[11.5px]">
            {place.distanceKm} km · {place.fee}
          </span>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-black tracking-[0.04em] uppercase"
          style={{ background: 'color-mix(in srgb, var(--primary) 9%, transparent)', color: 'var(--primary)' }}
        >
          {place.zone === 'ooty-town' ? 'In town' : place.zone === 'coonoor' ? 'Coonoor' : 'Excursion'}
        </span>
      </div>
      <span className="text-ink/70 mt-1.5 text-[12px]">
        <Icon name="clock" size={12} /> {place.bestTime}
      </span>

      {open && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-[#EBE1CF] pt-2">
          <span className="text-muted text-[11.5px]">{place.timings}</span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {place.highlights.map((h) => (
              <li key={h} className="text-ink/80 flex items-start gap-1.5 text-[12px]">
                <Icon name="point" size={12} className="mt-[3px] flex-none" style={{ color: 'var(--accent-ink)' }} />
                {h}
              </li>
            ))}
          </ul>
          {place.tip && (
            <span className="text-[12px] font-semibold" style={{ color: 'var(--accent-ink)' }}>
              Tip: {place.tip}
            </span>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-primary mt-2 flex w-fit cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[12px] font-bold"
      >
        {open ? 'Less' : 'More'} <Icon name={open ? 'chevron-up' : 'chevron-down'} size={13} />
      </button>
    </div>
  );
}

/**
 * Step 2 — Preferences: what the traveller cares about, the local places
 * around Ooty, and an auto-generated day-wise itinerary for the tour dates.
 */
export default function PreferencesStep() {
  const dispatch = useAppDispatch();
  const { interests, servicePrefs, itinerary, generatedFor } = useAppSelector((s) => s.prefs);
  const days = useAppSelector(selectDays);
  const destSet = useAppSelector((s) => s.plan.dest.length > 0);

  const fingerprint = useMemo(
    () => `${days[0] ?? ''}|${days[days.length - 1] ?? ''}|${days.length}|${[...interests].sort().join(',')}`,
    [days, interests],
  );

  const generate = () =>
    dispatch(setItinerary({ days: buildItinerary(days, interests), fingerprint }));

  // Keep the plan fresh: (re)generate whenever dates or interests change.
  useEffect(() => {
    if (days.length > 0 && fingerprint !== generatedFor) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  return (
    <div className="flex flex-col gap-6">
      {/* Heading */}
      <div className="flex flex-col gap-1">
        <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
          Preferences
        </span>
        <span className="text-[13px] text-white/60">
          Tell us what you love — we&apos;ll shape your days (and your surprises) around it.
        </span>
      </div>

      {/* Interests */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
            What are you into?
          </span>
          <span className="text-[12.5px] text-white/55">Pick any — they shape the itinerary</span>
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

      {/* Itinerary */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
              Your AI-crafted itinerary
            </span>
            <span className="text-[12.5px] text-white/55">
              {days.length > 0
                ? `${days.length} day${days.length > 1 ? 's' : ''} · beats the crowds with early starts`
                : 'Pick your tour dates on the Plan step and the day-plan appears here.'}
            </span>
          </div>
          {days.length > 0 && (
            <Button size="small" variant="outlined" onClick={generate} startIcon={<Icon name="refresh" size={15} />}
              sx={{ color: 'rgba(255,255,255,.85)', borderColor: 'rgba(255,255,255,.3)' }}>
              Regenerate
            </Button>
          )}
        </div>

        {itinerary && itinerary.length > 0 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
            {itinerary.map((day, i) => (
              <div
                key={day.date}
                className="flex flex-col gap-2 rounded-[16px] border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-serif text-[16px] font-bold text-white">
                    Day {i + 1} — {day.title}
                  </span>
                  <span className="text-[11.5px] whitespace-nowrap text-white/55">{fmtDay(day.date)}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {day.stops.map((s) => (
                    <div key={`${s.placeId}-${s.time}`} className="flex items-start gap-2.5">
                      <span
                        className="mt-[1px] w-[64px] flex-none rounded-md px-1.5 py-0.5 text-center text-[10.5px] font-black"
                        style={{ background: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)' }}
                      >
                        {s.time}
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="text-[13px] leading-tight font-bold text-white">
                          {s.name} {s.duration && <span className="font-medium text-white/45">{s.duration}</span>}
                        </span>
                        <span className="text-[11.5px] text-white/50">{s.note}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Local places explorer */}
      {destSet && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
              Explore places around Ooty
            </span>
            <span className="text-[12.5px] text-white/55">{OOTY_PLACES.length} spots · timings, fees & crowd tips</span>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))' }}>
            {OOTY_PLACES.map((p) => (
              <PlaceCard key={p.id} place={p} />
            ))}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div
        className="sticky bottom-0 z-30 flex flex-col gap-2 border-t border-white/15 py-3 backdrop-blur-md"
        style={{ background: 'color-mix(in srgb, var(--bg2) 82%, transparent)' }}
      >
        <span className="flex items-center gap-2 text-[13px] text-white/65">
          <Icon name="info-circle" size={16} /> All optional — your picks fine-tune the plan and the
          surprises.
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
