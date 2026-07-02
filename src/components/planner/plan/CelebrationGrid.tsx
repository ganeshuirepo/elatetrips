'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleCeleb } from '@/store/slices/planSlice';
import { CELEBRATIONS, CELEB_CATEGORY_META } from '@/data/celebrations';
import { celebComboValid } from '@/domain/rules';
import Icon from '@/components/ui/Icon';
import type { Celebration } from '@/domain/types';

/** Occasion picker — compact pill tiles grouped by category. Incompatible tiles dim. */
export default function CelebrationGrid({ onPick }: { onPick?: (id: Celebration['id']) => void }) {
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
        onClick={() => {
          dispatch(toggleCeleb(c.id));
          onPick?.(c.id);
        }}
        className="flex items-center justify-center gap-2 rounded-[14px] border-[1.5px] px-2.5 py-9.5 transition-colors disabled:cursor-not-allowed"
        style={{
          opacity: disabled ? 0.4 : 1,
          background: selected ? 'var(--accent)' : '#FAF7F2',
          borderColor: selected ? 'var(--accent)' : '#EBE1CF',
          boxShadow: '0 24px 44px -34px rgba(3,18,19,.55)',
        }}
      >
        <span
          className="flex items-center justify-center text-[28px]"
          style={{ color: selected ? '#08201F' : 'var(--primary)' }}
        >
          <Icon name={c.icon} />
        </span>
        <span
          className="min-w-0 text-center text-[16px] leading-tight font-bold whitespace-nowrap"
          style={{ color: selected ? '#08201F' : 'var(--ink)' }}
        >
          {c.name}
        </span>
      </button>
    );
  };

  return (
    // Two parallel sections side by side: Celebration (4 cols) | Escapes (2 cols).
    // The 4:2 flex ratio keeps tiles the same size across both sections.
    <div className="flex items-start gap-6">
      {CELEB_CATEGORY_META.map((cat) => {
        const items = CELEBRATIONS.filter((c) => c.category === cat.id);
        if (items.length === 0) return null;
        // 3 columns keep every label (e.g. "Anniversary") on one line at 21px.
        const cols = cat.id === 'rejuvenate' ? 2 : 3;
        return (
          <div
            key={cat.id}
            className="flex min-w-0 flex-col gap-2"
            style={{ flex: cat.id === 'rejuvenate' ? 2.4 : 3.6 }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="text-[11px] font-black tracking-[0.06em] uppercase"
                style={{ color: 'var(--accent)' }}
              >
                {cat.label}
              </span>
              <span className="text-[12.5px] text-white/55">{cat.sub}</span>
            </div>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {items.map(tile)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
