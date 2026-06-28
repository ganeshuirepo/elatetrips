'use client';

import { useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setTVehicle, setTDays } from '@/store/slices/transportSlice';
import { selectPax, selectDays } from '@/store/selectors/planSelectors';
import { VEHICLES } from '@/data/vehicles';
import { validVehicleIds } from '@/domain/rules';

/** Vehicle tiles filtered by traveller count; local-trip day count when applicable. */
export default function VehiclePicker() {
  const dispatch = useAppDispatch();
  const pax = useAppSelector(selectPax);
  const days = useAppSelector(selectDays);
  const { tVehicle, tTrip, tDays } = useAppSelector((s) => s.transport);

  const valid = useMemo(() => new Set(validVehicleIds(pax)), [pax]);
  const options = VEHICLES.filter((v) => valid.has(v.id));
  const maxDays = Math.max(1, days.length || 1);

  return (
    <div className="flex flex-col gap-3">
      <span className="text-accent-ink text-[11px] font-black tracking-[0.06em] uppercase">
        Pick your vehicle ({pax} {pax === 1 ? 'traveller' : 'travellers'})
      </span>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))' }}
      >
        {options.map((v) => {
          const active = tVehicle === v.id;
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={active}
              onClick={() => dispatch(setTVehicle(v.id))}
              className="flex flex-col gap-[1px] rounded-[12px] border-[1.5px] px-[13px] py-[11px] text-left"
              style={{
                borderColor: active ? 'var(--accent)' : 'var(--line)',
                background: active ? 'color-mix(in srgb, var(--accent) 8%, #fff)' : '#fff',
              }}
            >
              <span className="text-ink text-[14px] font-bold">{v.name}</span>
              <span className="text-muted text-[12px]">{v.sub}</span>
              <span className="text-accent-ink text-[11.5px] font-semibold">
                {tTrip === 'local' ? `₹${v.localRate.toLocaleString('en-IN')}/day` : `₹${v.rate}/km`}
              </span>
            </button>
          );
        })}
      </div>

      {tTrip === 'local' && (
        <label className="text-ink flex items-center gap-3 text-[13px] font-semibold">
          Local-trip days
          <input
            type="number"
            min={1}
            max={maxDays}
            value={Math.min(tDays, maxDays)}
            onChange={(e) => dispatch(setTDays(Math.min(maxDays, Number(e.target.value) || 1)))}
            className="border-line w-[80px] rounded-[10px] border px-3 py-2 text-[13px] outline-none"
          />
          <span className="text-muted text-[12px]">of {maxDays} tour days</span>
        </label>
      )}
    </div>
  );
}
