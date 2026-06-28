'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setCelebDay, setCelebAge } from '@/store/slices/planSlice';
import { selectDays } from '@/store/selectors/planSelectors';
import { CELEBRATIONS } from '@/data/celebrations';
import { fmtDay } from '@/domain/format';
import Icon from '@/components/ui/Icon';

/** Per-celebration day (and age for Birthday / Milestone) selection rows. */
export default function CelebrationDays() {
  const dispatch = useAppDispatch();
  const { celebs, celebDays, celebAge } = useAppSelector((s) => s.plan);
  const days = useAppSelector(selectDays);

  if (celebs.length === 0) return null;

  if (days.length === 0) {
    return (
      <p className="border-line bg-sand/40 text-muted rounded-[12px] border border-dashed px-3 py-2 text-[12.5px]">
        Pick your tour dates to choose a day for each celebration.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {celebs.map((id) => {
        const c = CELEBRATIONS.find((x) => x.id === id)!;
        const ageBound = id === 'birthday';
        return (
          <div
            key={id}
            className="border-line flex flex-wrap items-center gap-2 rounded-[12px] border bg-white p-2"
          >
            <span className="text-ink flex min-w-[140px] flex-1 items-center gap-2 text-[13.5px] font-bold">
              <Icon name={c.icon} size={17} style={{ color: 'var(--accent-ink)' }} />
              {c.name}
            </span>
            <select
              value={celebDays[id] || ''}
              onChange={(e) => dispatch(setCelebDay({ id, day: e.target.value }))}
              aria-label={`${c.name} day`}
              className="border-line text-ink min-w-[150px] flex-1 rounded-[10px] border bg-white px-3 py-2 text-[13px] font-semibold outline-none"
            >
              <option value="">Choose a day…</option>
              {days.map((v) => (
                <option key={v} value={v}>
                  {fmtDay(v)}
                </option>
              ))}
            </select>
            {ageBound && (
              <input
                inputMode="numeric"
                placeholder="Age"
                value={celebAge[id] || ''}
                onChange={(e) => dispatch(setCelebAge({ id, age: e.target.value }))}
                aria-label={`${c.name} age`}
                className="border-line w-[72px] rounded-[10px] border px-3 py-2 text-[13px] font-semibold outline-none"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
