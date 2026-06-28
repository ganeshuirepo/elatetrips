import ProductCard from './ProductCard';
import type { Product } from '@/domain/types';

/** Responsive product grid — columns reflow by width with no breakpoints. */
export default function ProductGrid({
  products,
  catName,
}: {
  products: Product[];
  catName?: (id: string) => string;
}) {
  if (products.length === 0) {
    return <p className="text-muted text-[13px]">No products match the selected filters.</p>;
  }
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))' }}
    >
      {products.map((p) => (
        <ProductCard key={p.id} product={p} category={catName?.(p.cat)} />
      ))}
    </div>
  );
}
