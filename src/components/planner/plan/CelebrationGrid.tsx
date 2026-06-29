'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleCeleb } from '@/store/slices/planSlice';
import { CELEBRATIONS, CELEB_CATEGORY_META } from '@/data/celebrations';
import { celebComboValid } from '@/domain/rules';
import Icon from '@/components/ui/Icon';
import type { Celebration } from '@/domain/types';

/** Occasion picker — square tiles grouped by category. Incompatible tiles dim. */
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
        className="flex aspect-square flex-col items-center justify-center gap-2.5 rounded-[18px] border-[1.5px] p-3 transition-colors disabled:cursor-not-allowed"
        style={{
          opacity: disabled ? 0.4 : 1,
          background: selected ? 'var(--accent)' : '#FAF7F2',
          borderColor: selected ? 'var(--accent)' : '#EBE1CF',
          boxShadow: '0 24px 44px -34px rgba(3,18,19,.55)',
        }}
      >
        <span
          className="flex items-center justify-center text-[38px]"
          style={{ color: selected ? '#08201F' : 'var(--primary)' }}
        >
          <Icon name={c.icon} />
        </span>
        <span
          className="text-center text-[13px] leading-tight font-bold"
          style={{ color: selected ? '#08201F' : 'var(--ink)' }}
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
              <span
                className="text-[11px] font-black tracking-[0.06em] uppercase"
                style={{ color: 'var(--accent)' }}
              >
                {cat.label}
              </span>
              <span className="text-[12.5px] text-white/55">{cat.sub}</span>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              {items.map(tile)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
