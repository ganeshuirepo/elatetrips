'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleCeleb } from '@/store/slices/planSlice';
import { CELEBRATIONS, CELEB_CATEGORY_META } from '@/data/celebrations';
import { celebComboValid } from '@/domain/rules';
import Icon from '@/components/ui/Icon';
import type { Celebration } from '@/domain/types';

type CategoryMeta = (typeof CELEB_CATEGORY_META)[number];

/** Occasion picker — icon tiles grouped by category. Incompatible tiles dim. */
export default function CelebrationGrid() {
  const dispatch = useAppDispatch();
  const { celebs, maxCelebrations } = useAppSelector((s) => s.plan);
  const atMax = celebs.length >= maxCelebrations;

  const tile = (c: Celebration, cat: CategoryMeta) => {
    const selected = celebs.includes(c.id);
    const disabled = !selected && (atMax || !celebComboValid([...celebs, c.id]));
    return (
      <button
        key={c.id}
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={() => dispatch(toggleCeleb(c.id))}
        className="flex flex-col items-center gap-1.5 rounded-[12px] border-[1.5px] p-2 transition-colors disabled:cursor-not-allowed"
        style={{
          borderColor: selected ? 'var(--accent)' : 'var(--line)',
          background: selected ? 'color-mix(in srgb, var(--accent) 8%, #fff)' : '#fff',
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <span
          className="flex h-10 w-10 items-center justify-center rounded-[10px] text-[20px]"
          style={{
            background: selected ? cat.iconBgActive : cat.iconBg,
            color: selected ? '#fff' : cat.iconInk,
          }}
        >
          <Icon name={c.icon} />
        </span>
        <span
          className="text-center text-[12px] leading-tight font-bold"
          style={{ color: selected ? 'var(--accent-ink)' : 'var(--ink)' }}
        >
          {c.name}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-accent-ink text-[11px] font-black tracking-[0.06em] uppercase">
          Occasions
        </span>
        <span className="text-muted text-[12.5px]">
          Select up to {maxCelebrations} — pick a day for each.
        </span>
      </div>

      {CELEB_CATEGORY_META.map((cat) => {
        const items = CELEBRATIONS.filter((c) => c.category === cat.id);
        if (items.length === 0) return null;
        return (
          <div key={cat.id} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-ink text-[12.5px] font-extrabold">{cat.label}</span>
              <span className="text-muted text-[11.5px]">· {cat.sub}</span>
            </div>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 6.5rem), 1fr))' }}
            >
              {items.map((c) => tile(c, cat))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
