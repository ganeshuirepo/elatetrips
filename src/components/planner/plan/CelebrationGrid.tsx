'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleCeleb } from '@/store/slices/planSlice';
import { CELEBRATIONS, CELEB_CATEGORY_META } from '@/data/celebrations';
import { celebComboValid } from '@/domain/rules';
import Icon from '@/components/ui/Icon';
import type { Celebration } from '@/domain/types';

/** Uniform resting fill for every occasion tile's icon swatch (both groups). */
const TILE_ICON_FILL = 'color-mix(in srgb, var(--accent) 32%, #fff)';

/** Occasion picker — icon tiles grouped by category. Incompatible tiles dim. */
export default function CelebrationGrid() {
  const dispatch = useAppDispatch();
  const { celebs, maxCelebrations } = useAppSelector((s) => s.plan);
  const atMax = celebs.length >= maxCelebrations;

  const tile = (c: Celebration) => {
    const selected = celebs.includes(c.id);
    const disabled = !selected && (atMax || !celebComboValid([...celebs, c.id]));
    return (
      <button
        key={c.id}
        type="button"
        aria-pressed={selected}
        aria-label={c.name}
        disabled={disabled}
        onClick={() => dispatch(toggleCeleb(c.id))}
        className="flex flex-col items-center gap-1.5 transition-colors disabled:cursor-not-allowed"
        style={{ opacity: disabled ? 0.45 : 1 }}
      >
        <span
          className="flex h-[64px] w-[64px] items-center justify-center rounded-full text-[30px]"
          style={{
            background: selected ? 'var(--accent)' : TILE_ICON_FILL,
            color: selected ? '#fff' : 'var(--primary)',
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
    <div className="flex flex-col gap-5">
      {CELEB_CATEGORY_META.map((cat) => {
        const items = CELEBRATIONS.filter((c) => c.category === cat.id);
        if (items.length === 0) return null;
        return (
          <div key={cat.id} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-accent-ink text-[11px] font-black tracking-[0.06em] uppercase">
                {cat.label}
              </span>
              <span className="text-muted text-[12.5px]">{cat.sub}</span>
            </div>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 6.5rem), 1fr))' }}
            >
              {items.map(tile)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
