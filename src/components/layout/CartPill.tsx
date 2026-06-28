'use client';

import { useAppSelector } from '@/store/hooks';
import { selectCartCount, selectCartTotal } from '@/store/selectors/cartSelectors';
import { inr } from '@/domain/format';
import Icon from '@/components/ui/Icon';

/** Header cart summary — hidden until the cart has at least one item. */
export default function CartPill() {
  const count = useAppSelector(selectCartCount);
  const total = useAppSelector(selectCartTotal);
  if (count === 0) return null;

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-[13px] py-[6px]"
      style={{
        background: 'color-mix(in srgb, var(--accent) 12%, #fff)',
        border: '1.5px solid color-mix(in srgb, var(--accent) 28%, transparent)',
      }}
    >
      <Icon name="shopping-cart" size={16} style={{ color: 'var(--accent-ink)' }} />
      <span className="text-accent-ink text-[12.5px] font-extrabold">
        {count} · {inr(total)}
      </span>
    </div>
  );
}
