'use client';

import Button from '@mui/material/Button';
import { useAppDispatch } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import { SHOPS } from '@/data/shop';
import ProductGrid from '@/components/shop/ProductGrid';
import Icon from '@/components/ui/Icon';

/** Step 4 — surprise gifts + medical kits, sharing the cart. */
export default function ShopStep() {
  const dispatch = useAppDispatch();

  return (
    <div className="flex flex-col gap-7">
      {(['gifts', 'medical'] as const).map((key) => (
        <section key={key} className="flex flex-col gap-3">
          <div className="flex flex-col">
            <h3 className="text-primary m-0 font-serif text-xl font-bold">{SHOPS[key].title}</h3>
            <p className="text-muted m-0 text-[12.5px]">{SHOPS[key].subtitle}</p>
          </div>
          <ProductGrid products={SHOPS[key].products} />
        </section>
      ))}

      <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <span className="text-muted flex items-center gap-2 text-[13px]">
          <Icon name="gift" size={16} /> Optional surprises — add to the shared cart, or skip ahead.
        </span>
        <div className="flex gap-2">
          <Button variant="text" color="primary" onClick={() => dispatch(setStep('stay'))}>
            Back
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="large"
            onClick={() => dispatch(setStep('review'))}
            endIcon={<Icon name="arrow-right" size={18} />}
          >
            Continue to review
          </Button>
        </div>
      </div>
    </div>
  );
}
