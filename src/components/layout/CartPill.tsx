'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectCartLines,
  selectCartSubtotal,
  type CartLine,
} from '@/store/selectors/unifiedCartSelectors';
import { removeFromCart } from '@/store/slices/cartSlice';
import { toggleSvcPick } from '@/store/slices/servicesSlice';
import { selectRoom } from '@/store/slices/hotelSlice';
import { setView, setStep } from '@/store/slices/uiSlice';
import { inr } from '@/domain/format';
import Icon from '@/components/ui/Icon';

const SOURCE_ICON: Record<CartLine['source'], string> = {
  shop: 'gift',
  service: 'sparkles',
  stay: 'building',
};

/**
 * Header cart: one badge + dropdown for everything selected anywhere in the
 * app — surprise-gift products, services-step picks and the chosen room —
 * with a single "Review & checkout" that lands on the shared review page.
 */
export default function CartPill() {
  const dispatch = useAppDispatch();
  const lines = useAppSelector(selectCartLines);
  const subtotal = useAppSelector(selectCartSubtotal);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (lines.length === 0) return null;

  const removeLine = (line: CartLine) => {
    const r = line.remove;
    if (r.kind === 'shop') dispatch(removeFromCart(r.productId));
    else if (r.kind === 'service') dispatch(toggleSvcPick({ cat: r.cat, id: r.optionId }));
    else dispatch(selectRoom({ id: '', room: '' }));
  };

  const goToReview = () => {
    setOpen(false);
    dispatch(setView('planner'));
    dispatch(setStep('review'));
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex cursor-pointer items-center gap-2 rounded-full border-none px-[13px] py-[6px]"
        style={{
          background: 'color-mix(in srgb, var(--accent) 12%, #fff)',
          border: '1.5px solid color-mix(in srgb, var(--accent) 28%, transparent)',
        }}
        aria-label="Open cart"
      >
        <Icon name="shopping-cart" size={16} style={{ color: 'var(--accent-ink)' }} />
        <span className="text-accent-ink text-[12.5px] font-extrabold">
          {lines.length} · {inr(subtotal)}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+10px)] z-50 flex w-[340px] flex-col gap-2 rounded-[16px] bg-white p-4 shadow-2xl"
          style={{ border: '1px solid var(--line)' }}
        >
          <h3 className="text-primary m-0 font-serif text-lg font-bold">Your cart</h3>

          <div className="flex max-h-[320px] flex-col gap-1 overflow-y-auto">
            {lines.map((line) => (
              <div
                key={line.key}
                className="border-line flex items-center gap-2.5 border-b py-2 last:border-b-0"
              >
                <Icon
                  name={SOURCE_ICON[line.source]}
                  size={16}
                  style={{ color: 'var(--primary)' }}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-ink truncate text-[13px] font-bold">{line.label}</span>
                  <span className="text-muted text-[11.5px]">{line.detail}</span>
                </div>
                <span className="text-ink text-[12.5px] font-extrabold whitespace-nowrap">
                  {inr(line.amount)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${line.label}`}
                  onClick={() => removeLine(line)}
                  className="text-muted cursor-pointer border-none bg-transparent p-0 hover:text-[#C0392B]"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>

          <div className="bg-sand/60 flex items-center justify-between rounded-[10px] px-3 py-2">
            <span className="text-ink text-[12.5px] font-extrabold">Subtotal</span>
            <span className="text-accent-ink text-[15px] font-extrabold">{inr(subtotal)}</span>
          </div>

          <Button variant="contained" color="primary" onClick={goToReview}>
            Review &amp; checkout
          </Button>
        </div>
      )}
    </div>
  );
}
