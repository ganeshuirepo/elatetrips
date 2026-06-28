'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addToCart, decFromCart } from '@/store/slices/cartSlice';
import { inr } from '@/domain/format';
import Stepper from '@/components/ui/Stepper';
import Icon from '@/components/ui/Icon';
import type { Product } from '@/domain/types';

/** Single shop product with rating, pricing and add-to-cart controls. */
export default function ProductCard({
  product,
  category,
}: {
  product: Product;
  category?: string;
}) {
  const dispatch = useAppDispatch();
  const qty = useAppSelector((s) => s.cart.items[product.id] || 0);
  const disc = Math.round((1 - product.price / product.mrp) * 100);

  return (
    <div className="border-line flex flex-col gap-2 rounded-[16px] border bg-white p-4">
      <div className="bg-sand text-primary relative flex h-[120px] items-center justify-center rounded-[12px] text-[44px]">
        <Icon name={product.icon} />
        {product.badge && (
          <span className="bg-accent absolute top-2 left-2 rounded-full px-2 py-[3px] text-[10.5px] font-black text-white">
            {product.badge}
          </span>
        )}
      </div>

      {category && (
        <span className="bg-sand text-accent-ink w-fit rounded px-1.5 py-[1px] text-[10px] font-bold">
          {category}
        </span>
      )}

      <span className="text-ink text-[14px] leading-tight font-bold">{product.name}</span>

      <div className="flex items-center gap-2 text-[12px]">
        <span className="flex items-center gap-1 rounded bg-[#1E7A3A] px-1.5 py-[1px] font-bold text-white">
          {product.rating.toFixed(1)} <Icon name="star-filled" size={10} />
        </span>
        <span className="text-muted">{product.reviews.toLocaleString('en-IN')}</span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-ink text-[16px] font-extrabold">{inr(product.price)}</span>
        <span className="text-muted text-[12px] line-through">{inr(product.mrp)}</span>
        <span className="text-[12px] font-bold text-[#1E7A3A]">{disc}% OFF</span>
      </div>

      <span className="text-muted text-[11.5px]">Delivery: {product.delivery}</span>

      <div className="mt-1">
        {qty === 0 ? (
          <Button
            fullWidth
            variant="outlined"
            color="secondary"
            size="small"
            onClick={() => dispatch(addToCart(product.id))}
            startIcon={<Icon name="shopping-cart-plus" size={16} />}
          >
            Add to cart
          </Button>
        ) : (
          <div className="flex items-center justify-center">
            <Stepper
              ariaLabel={`${product.name} quantity`}
              value={qty}
              min={0}
              onDec={() => dispatch(decFromCart(product.id))}
              onInc={() => dispatch(addToCart(product.id))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
