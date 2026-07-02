'use client';

import { useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectDest,
  setTravellers,
  setRooms,
  toggleCeleb,
  clearDates,
  pickDay,
} from '@/store/slices/planSlice';
import { setStep } from '@/store/slices/uiSlice';
import { setTMode, setTTrip, setTVehicle } from '@/store/slices/transportSlice';
import { setSvcField, setOccasionField, toggleSvcPick } from '@/store/slices/servicesSlice';
import { setAppliedCoupon } from '@/store/slices/reviewSlice';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { parseVoiceInput, isEmptyParse } from '@/domain/voiceParse';
import { fmtDay } from '@/domain/format';
import { VEHICLES } from '@/data/vehicles';
import {
  SHARED_CATEGORIES,
  SPECIAL_CATEGORIES,
  SURPRISE_GIFTS,
  TIME_OPTIONS,
  VENUE_OPTIONS,
  AGE_GROUPS,
  GENDERS,
  MILESTONE_FOR,
  type ServiceOption,
} from '@/data/services';
import { CELEBRATIONS } from '@/data/celebrations';
import Icon from '@/components/ui/Icon';

const CELEB_NAME: Record<string, string> = Object.fromEntries(
  CELEBRATIONS.map((c) => [c.id, c.name]),
);
const SVC_LABEL: Record<string, Record<string, string>> = {};
[...SHARED_CATEGORIES, ...Object.values(SPECIAL_CATEGORIES), SURPRISE_GIFTS].forEach((cat) => {
  SVC_LABEL[cat.id] = Object.fromEntries(cat.options.map((o) => [o.id, o.label]));
});
const optLabel = (list: ServiceOption[], id: string) =>
  list.find((o) => o.id === id)?.label ?? id;

const EXAMPLE =
  "Try: “A birthday in Ooty, 24 to 28 December, 6 guests, 2 rooms, outdoor in the evening, with a photographer, cake and DJ — cab for the complete trip in an SUV, coupon DEALNOW.”";

/** Floating voice assistant — captures plan + celebration + services in one place. */
export default function VoiceAssistant() {
  const dispatch = useAppDispatch();
  const view = useAppSelector((s) => s.ui.view);
  const plan = useAppSelector((s) => s.plan);
  const picks = useAppSelector((s) => s.services.picks);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  // Voice dictates into the same text box the user can type/edit.
  const sr = useSpeechRecognition({
    onResult: (chunk) => setText((t) => (t ? `${t} ${chunk}` : chunk)),
  });

  const source = `${text} ${sr.interim}`.trim();
  const parsed = useMemo(() => parseVoiceInput(source), [source]);
  const empty = isEmptyParse(parsed);

  const rows = useMemo(() => {
    const r: { icon: string; label: string; value: string }[] = [];
    if (parsed.destination) r.push({ icon: 'map-pin', label: 'Destination', value: parsed.destination.name });
    if (parsed.dates)
      r.push({
        icon: 'calendar-event',
        label: 'Dates',
        value: `${fmtDay(parsed.dates.start)} → ${fmtDay(parsed.dates.end)}`,
      });
    if (parsed.celebrations.length)
      r.push({
        icon: 'confetti',
        label: 'Occasion',
        value: parsed.celebrations.map((id) => CELEB_NAME[id] ?? id).join(', '),
      });
    const guests: string[] = [];
    if (parsed.adults != null) guests.push(`${parsed.adults} adult${parsed.adults === 1 ? '' : 's'}`);
    if (parsed.children != null)
      guests.push(`${parsed.children} child${parsed.children === 1 ? '' : 'ren'}`);
    if (guests.length) r.push({ icon: 'users', label: 'Guests', value: guests.join(', ') });
    if (parsed.rooms != null)
      r.push({ icon: 'bed', label: 'Rooms', value: `${parsed.rooms} room${parsed.rooms === 1 ? '' : 's'}` });
    if (parsed.venue) r.push({ icon: 'building', label: 'Venue', value: optLabel(VENUE_OPTIONS, parsed.venue) });
    if (parsed.time) r.push({ icon: 'clock', label: 'Time', value: optLabel(TIME_OPTIONS, parsed.time) });
    if (parsed.ageGroup)
      r.push({ icon: 'friends', label: 'Age group', value: optLabel(AGE_GROUPS, parsed.ageGroup) });
    if (parsed.gender) r.push({ icon: 'user', label: 'For', value: optLabel(GENDERS, parsed.gender) });
    if (parsed.milestoneFor)
      r.push({ icon: 'award', label: 'Milestone', value: optLabel(MILESTONE_FOR, parsed.milestoneFor) });
    if (parsed.transport || parsed.tripType || parsed.vehicle) {
      const bits = [
        parsed.transport === 'own' ? 'Own transport' : parsed.transport === 'cab' ? 'Cab' : '',
        parsed.tripType === 'endtoend' ? 'Complete trip' : parsed.tripType === 'local' ? 'Local trips' : '',
        parsed.vehicle ? (VEHICLES.find((v) => v.id === parsed.vehicle)?.name ?? parsed.vehicle) : '',
      ].filter(Boolean);
      r.push({ icon: 'car', label: 'Transport', value: bits.join(' · ') });
    }
    if (parsed.coupon) r.push({ icon: 'discount-2', label: 'Coupon', value: parsed.coupon });
    const svc = Object.entries(parsed.services)
      .flatMap(([cat, ids]) => ids.map((id) => SVC_LABEL[cat]?.[id] ?? id))
      .join(', ');
    if (svc) r.push({ icon: 'sparkles', label: 'Services', value: svc });
    return r;
  }, [parsed]);

  if (view !== 'planner') return null;

  const apply = () => {
    if (parsed.destination) dispatch(selectDest(parsed.destination));
    if (parsed.dates) {
      dispatch(clearDates());
      dispatch(pickDay(parsed.dates.start));
      dispatch(pickDay(parsed.dates.end));
    }
    if (parsed.adults != null || parsed.children != null)
      dispatch(setTravellers({ adults: parsed.adults, children: parsed.children }));
    if (parsed.rooms != null) dispatch(setRooms(parsed.rooms));
    parsed.celebrations.forEach((id) => {
      if (!plan.celebs.includes(id)) dispatch(toggleCeleb(id));
    });
    if (parsed.venue) dispatch(setSvcField({ key: 'venue', value: parsed.venue }));
    const time = parsed.time;
    if (time)
      parsed.celebrations.forEach((cid) => dispatch(setOccasionField({ id: cid, key: 'time', value: time })));
    if (parsed.ageGroup) dispatch(setSvcField({ key: 'ageGroup', value: parsed.ageGroup }));
    if (parsed.gender) dispatch(setSvcField({ key: 'gender', value: parsed.gender }));
    if (parsed.milestoneFor) dispatch(setSvcField({ key: 'milestoneFor', value: parsed.milestoneFor }));
    if (parsed.transport) dispatch(setTMode(parsed.transport));
    if (parsed.tripType) dispatch(setTTrip(parsed.tripType));
    if (parsed.vehicle) dispatch(setTVehicle(parsed.vehicle));
    if (parsed.coupon) dispatch(setAppliedCoupon(parsed.coupon));
    Object.entries(parsed.services).forEach(([cat, ids]) =>
      ids.forEach((id) => {
        if (!(picks[cat] ?? []).includes(id)) dispatch(toggleSvcPick({ cat, id }));
      }),
    );

    // The merged Plan step needs destination + dates + an occasion before the
    // wizard can move on; land wherever the journey actually is.
    const destOk = !!parsed.destination || plan.dest.length > 0;
    const datesOk = !!parsed.dates || (!!plan.start && !!plan.end);
    const celebOk = parsed.celebrations.length > 0 || plan.celebs.length > 0;
    dispatch(setStep(destOk && datesOk && celebOk ? 'services' : 'plan'));

    sr.stop();
    setOpen(false);
  };

  return (
    <div className="fixed right-6 bottom-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div
          className="flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-[18px] border p-4 shadow-2xl"
          style={{ background: '#FAF7F2', borderColor: '#EBE1CF' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-ink flex items-center gap-2 font-serif text-[17px] font-bold">
              <Icon name="microphone" size={18} style={{ color: 'var(--accent-ink)' }} /> Voice
              planner
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => {
                sr.stop();
                setOpen(false);
              }}
              className="text-muted cursor-pointer border-none bg-transparent text-[18px]"
            >
              <Icon name="x" />
            </button>
          </div>

          {sr.supported ? (
            <button
              type="button"
              onClick={() => (sr.listening ? sr.stop() : sr.start())}
              className="flex items-center justify-center gap-2 rounded-[12px] border-none py-3 text-[14px] font-bold"
              style={
                sr.listening
                  ? { background: 'color-mix(in srgb, #c0392b 12%, #fff)', color: '#a5281c' }
                  : { background: 'linear-gradient(180deg,#e9c97f,#d4a94f)', color: '#08201f' }
              }
            >
              <Icon name={sr.listening ? 'player-stop-filled' : 'microphone'} size={18} />
              {sr.listening ? 'Listening… tap to stop' : 'Tap to speak'}
            </button>
          ) : (
            <p className="text-muted text-[12.5px]">
              Voice needs Chrome or Edge with mic access — you can still type your request below.
            </p>
          )}

          <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder={EXAMPLE}
                className="text-ink w-full resize-none rounded-[12px] border px-3 py-2.5 text-[13px] outline-none"
                style={{ borderColor: '#EBE1CF', background: '#fff' }}
              />
              {sr.listening && sr.interim && (
                <span className="text-muted -mt-1 text-[12px] italic">…{sr.interim}</span>
              )}

              {rows.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-accent-ink text-[10.5px] font-black tracking-[0.06em] uppercase">
                    Detected
                  </span>
                  {rows.map((row) => (
                    <div key={row.label} className="flex items-start gap-2 text-[13px]">
                      <Icon
                        name={row.icon}
                        size={15}
                        className="mt-[2px] flex-none"
                        style={{ color: 'var(--accent-ink)' }}
                      />
                      <span className="text-muted w-[86px] flex-none font-semibold">{row.label}</span>
                      <span className="text-ink font-semibold">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {sr.error && sr.error !== 'aborted' && (
                <span className="text-[12px]" style={{ color: '#a5281c' }}>
                  {sr.error === 'not-allowed'
                    ? 'Microphone permission was blocked — allow it and try again.'
                    : `Speech error: ${sr.error}`}
                </span>
              )}

              <div className="flex items-center justify-between gap-2 border-t pt-3" style={{ borderColor: '#EFE7D6' }}>
                <button
                  type="button"
                  onClick={() => {
                    setText('');
                    sr.reset();
                  }}
                  disabled={!text && !sr.interim}
                  className="text-muted cursor-pointer rounded-[10px] border-[1.5px] bg-white px-3 py-2 text-[13px] font-bold disabled:opacity-40"
                  style={{ borderColor: '#DAD6CC' }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={empty}
                  className="flex items-center gap-1.5 rounded-[10px] border-none px-4 py-2 text-[13px] font-extrabold disabled:opacity-40"
                  style={{ background: 'linear-gradient(180deg,#e9c97f,#d4a94f)', color: '#08201f' }}
                >
                  Apply &amp; continue <Icon name="arrow-right" size={15} />
                </button>
              </div>
        </div>
      )}

      <button
        type="button"
        aria-label="Voice planner"
        onClick={() => setOpen((o) => !o)}
        className="flex h-14 w-14 items-center justify-center rounded-full border-none shadow-xl transition-transform hover:scale-105"
        style={{ background: 'linear-gradient(180deg,#e9c97f,#d4a94f)', color: '#08201f' }}
      >
        <Icon name={open ? 'x' : 'microphone'} size={24} />
      </button>
    </div>
  );
}
