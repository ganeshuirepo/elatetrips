'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setTTrip } from '@/store/slices/transportSlice';
import Icon from '@/components/ui/Icon';

const TRIPS = [
  { id: 'local', name: 'Local trips', sub: 'Sightseeing around the destination', icon: 'ti-map-2' },
  {
    id: 'endtoend',
    name: 'Complete trip',
    sub: 'Pickup from your city for the full tour',
    icon: 'ti-route',
  },
] as const;

/** Step 2 — local vs. complete-trip selection (moved here from the Plan step). */
export default function TripTypePicker() {
  const dispatch = useAppDispatch();
  const { tTrip } = useAppSelector((s) => s.transport);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-accent-ink text-[11px] font-black tracking-[0.06em] uppercase">
          Trip type
        </span>
        <span className="text-muted text-[12.5px]">Local or complete trip</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {TRIPS.map((t) => {
          const active = tTrip === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              onClick={() => dispatch(setTTrip(t.id))}
              className="flex flex-1 items-center gap-[11px] rounded-[14px] border-[1.5px] p-[13px] text-left"
              style={{
                borderColor: active ? 'var(--accent)' : 'var(--line)',
                background: active ? 'color-mix(in srgb, var(--accent) 9%, #fff)' : '#fff',
              }}
            >
              <span
                className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] text-[20px]"
                style={{
                  background: active ? 'var(--primary)' : 'var(--sand)',
                  color: active ? '#fff' : 'var(--primary)',
                }}
              >
                <Icon name={t.icon} />
              </span>
              <span className="flex flex-col">
                <span className="text-ink text-[14px] font-bold">{t.name}</span>
                <span className="text-muted text-[12px]">{t.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
