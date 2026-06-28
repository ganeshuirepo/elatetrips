'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { setView } from '@/store/slices/uiSlice';
import { SHOPS } from '@/data/shop';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import Icon from '@/components/ui/Icon';
import ProductGrid from './ProductGrid';
import type { Product, ShopKey } from '@/domain/types';

type SortKey = 'popular' | 'price-asc' | 'price-desc' | 'rating';

const PRICE_BUCKETS: { id: string; label: string; test: (p: Product) => boolean }[] = [
  { id: 'u500', label: 'Under ₹500', test: (p) => p.price < 500 },
  { id: '500-1000', label: '₹500 – ₹1,000', test: (p) => p.price >= 500 && p.price < 1000 },
  { id: '1000-2000', label: '₹1,000 – ₹2,000', test: (p) => p.price >= 1000 && p.price < 2000 },
  { id: '2000+', label: '₹2,000+', test: (p) => p.price >= 2000 },
];

const RATINGS: { id: number; label: string }[] = [
  { id: 0, label: 'Any' },
  { id: 4, label: '4★ & up' },
  { id: 4.5, label: '4.5★ & up' },
];

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'popular', label: 'Most popular' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'rating', label: 'Top rated' },
];

const discountPct = (p: Product) => Math.round((1 - p.price / p.mrp) * 100);
const toggle = (arr: string[], v: string) =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted text-[11px] font-black tracking-[0.05em] uppercase">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** Full shop catalogue page with a left filter sidebar (category, price, rating, offers). */
export default function ShopView({ shop }: { shop: ShopKey }) {
  const dispatch = useAppDispatch();
  const cfg = SHOPS[shop];

  const [cats, setCats] = useState<string[]>([]);
  const [price, setPrice] = useState<string[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [dealsOnly, setDealsOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('popular');

  // Category sets differ per shop — reset filters when the catalogue changes.
  useEffect(() => {
    setCats([]);
    setPrice([]);
    setMinRating(0);
    setDealsOnly(false);
    setSort('popular');
  }, [shop]);

  const catName = (id: string) => cfg.cats.find((c) => c.id === id)?.name ?? id;

  const products = useMemo(() => {
    const filtered = cfg.products.filter(
      (p) =>
        (cats.length === 0 || cats.includes(p.cat)) &&
        (price.length === 0 || PRICE_BUCKETS.some((b) => price.includes(b.id) && b.test(p))) &&
        p.rating >= minRating &&
        (!dealsOnly || discountPct(p) >= 25),
    );
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'price-asc':
          return a.price - b.price;
        case 'price-desc':
          return b.price - a.price;
        case 'rating':
          return b.rating - a.rating;
        default:
          return b.reviews - a.reviews;
      }
    });
    return sorted;
  }, [cfg, cats, price, minRating, dealsOnly, sort]);

  const hasFilters = cats.length > 0 || price.length > 0 || minRating > 0 || dealsOnly;

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-4 px-6 pt-4">
      <button
        type="button"
        onClick={() => dispatch(setView('planner'))}
        className="text-primary flex w-fit items-center gap-1.5 border-none bg-transparent p-0 text-[13px] font-bold"
      >
        <Icon name="arrow-left" size={16} /> Back to planner
      </button>

      <div className="flex flex-col gap-1">
        <h1 className="text-primary m-0 font-serif text-2xl font-bold">{cfg.title}</h1>
        <p className="text-muted m-0 text-[13.5px]">{cfg.subtitle}</p>
      </div>

      <div className="flex flex-wrap gap-6">
        {/* Filters */}
        <Card className="min-w-[13rem] flex-[1_1_13rem] self-start">
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="text-ink text-[13px] font-extrabold">Filters</span>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setCats([]);
                    setPrice([]);
                    setMinRating(0);
                    setDealsOnly(false);
                  }}
                  className="text-primary cursor-pointer border-none bg-transparent p-0 text-[12px] font-bold"
                >
                  Clear all
                </button>
              )}
            </div>

            <FilterGroup label="Category">
              {cfg.cats
                .filter((c) => c.id !== 'all')
                .map((c) => (
                  <Chip
                    key={c.id}
                    active={cats.includes(c.id)}
                    onClick={() => setCats((f) => toggle(f, c.id))}
                  >
                    {c.name}
                  </Chip>
                ))}
            </FilterGroup>

            <FilterGroup label="Price">
              {PRICE_BUCKETS.map((b) => (
                <Chip
                  key={b.id}
                  active={price.includes(b.id)}
                  onClick={() => setPrice((f) => toggle(f, b.id))}
                >
                  {b.label}
                </Chip>
              ))}
            </FilterGroup>

            <FilterGroup label="Rating">
              {RATINGS.map((r) => (
                <Chip key={r.id} active={minRating === r.id} onClick={() => setMinRating(r.id)}>
                  {r.label}
                </Chip>
              ))}
            </FilterGroup>

            <FilterGroup label="Offers">
              <Chip active={dealsOnly} onClick={() => setDealsOnly((v) => !v)}>
                25%+ off
              </Chip>
            </FilterGroup>
          </div>
        </Card>

        {/* Listing */}
        <div className="flex min-w-[18rem] flex-[3_1_22rem] flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted text-[12.5px] font-bold">
              {products.length} {products.length === 1 ? 'product' : 'products'}
            </span>
            <label className="text-muted flex items-center gap-2 text-[12.5px] font-semibold">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="border-line text-ink rounded-[8px] border bg-white px-2 py-1.5 text-[12.5px] font-semibold outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ProductGrid products={products} catName={catName} />
        </div>
      </div>
    </div>
  );
}
