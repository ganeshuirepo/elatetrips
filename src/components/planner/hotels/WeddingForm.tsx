'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setWGuests, setWCouple, setWBudget, toggleCeremony } from '@/store/slices/addonsSlice';
import {
  PRE_CEREMONIES,
  POST_CEREMONIES,
  W_BUDGET_MIN,
  W_BUDGET_MAX,
  W_BUDGET_STEP,
} from '@/data/wedding';
import { fmtLakh } from '@/domain/format';
import Chip from '@/components/ui/Chip';
import Icon from '@/components/ui/Icon';

/** Dedicated wedding planning form, shown when Wedding is selected. */
export default function WeddingForm() {
  const dispatch = useAppDispatch();
  const { wGuests, wCouple, wBudget, wCeremonies } = useAppSelector((s) => s.addons);
  const pct = ((wBudget - W_BUDGET_MIN) / (W_BUDGET_MAX - W_BUDGET_MIN)) * 100;

  return (
    <div className="border-line flex flex-col gap-4 rounded-[16px] border bg-white p-4">
      <span className="text-ink flex items-center gap-2 text-[14px] font-extrabold">
        <Icon name="glass-full" size={18} style={{ color: 'var(--accent-ink)' }} /> Wedding planning
      </span>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))' }}
      >
        <label className="text-muted flex flex-col gap-1 text-[12px] font-semibold">
          Couple name
          <input
            value={wCouple}
            onChange={(e) => dispatch(setWCouple(e.target.value))}
            placeholder="e.g. Aarav & Diya"
            className="border-line text-ink rounded-[10px] border px-3 py-2 text-[13px] outline-none"
          />
        </label>
        <label className="text-muted flex flex-col gap-1 text-[12px] font-semibold">
          Number of guests
          <input
            inputMode="numeric"
            value={wGuests}
            onChange={(e) => dispatch(setWGuests(e.target.value))}
            placeholder="e.g. 150"
            className="border-line text-ink rounded-[10px] border px-3 py-2 text-[13px] outline-none"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-muted text-[11px] font-black tracking-[0.05em] uppercase">
            Budget range
          </span>
          <span className="text-ink text-[13px] font-extrabold">
            {fmtLakh(wBudget)}
            {wBudget >= W_BUDGET_MAX && '+'}
          </span>
        </div>
        <input
          type="range"
          min={W_BUDGET_MIN}
          max={W_BUDGET_MAX}
          step={W_BUDGET_STEP}
          value={wBudget}
          onChange={(e) => dispatch(setWBudget(Number(e.target.value)))}
          aria-label="Wedding budget"
          className="h-[6px] w-full cursor-pointer appearance-none rounded-full outline-none"
          style={{
            accentColor: 'var(--accent)',
            background: `linear-gradient(90deg, var(--accent) ${pct}%, color-mix(in srgb, var(--muted) 22%, #fff) ${pct}%)`,
          }}
        />
      </div>

      {[
        { label: 'Pre-wedding ceremonies', items: PRE_CEREMONIES },
        { label: 'Post-wedding ceremonies', items: POST_CEREMONIES },
      ].map(({ label, items }) => (
        <div key={label} className="flex flex-col gap-2">
          <span className="text-muted text-[11px] font-black tracking-[0.05em] uppercase">
            {label}
          </span>
          <div className="flex flex-wrap gap-2">
            {items.map((c) => (
              <Chip
                key={c}
                active={wCeremonies.includes(c)}
                onClick={() => dispatch(toggleCeremony(c))}
              >
                {c}
              </Chip>
            ))}
          </div>
        </div>
      ))}

      <p className="bg-sand/60 text-muted flex items-start gap-2 rounded-[12px] p-3 text-[12.5px]">
        <Icon name="user-heart" size={16} style={{ color: 'var(--primary)', marginTop: 1 }} />
        An engagement manager will contact you to craft the full plan.
      </p>
    </div>
  );
}
