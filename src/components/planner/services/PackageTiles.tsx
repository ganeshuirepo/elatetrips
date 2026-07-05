'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import { detailsFor, type ServiceCategory, type ServiceOption } from '@/data/services';
import Icon from '@/components/ui/Icon';

/**
 * Shared package-tile building blocks: the tile grid with category filter
 * pills, the card with its image carousel, and the details modal. Used by the
 * Local specials step and the celebration services on the hotel detail.
 */

/**
 * A set of categories' package tiles in one grid, with single-select filter
 * pills above when more than one category is shown. `light` renders the
 * pills for a white card canvas instead of the dark planner background.
 */
export function OccasionTiles({
  cats,
  picks,
  onToggle,
  light = false,
}: {
  cats: ServiceCategory[];
  picks: Record<string, string[]>;
  onToggle: (cat: string, id: string) => void;
  light?: boolean;
}) {
  const [filter, setFilter] = useState('all');
  const active = cats.some((c) => c.id === filter) ? filter : 'all';
  const shown = active === 'all' ? cats : cats.filter((c) => c.id === active);
  const tiles = shown.flatMap((c) => c.options.map((o) => ({ catId: c.id, option: o })));
  const showFilters = cats.length > 1;

  return (
    <div className="flex flex-col gap-3">
      {showFilters && (
        <div className="flex flex-wrap gap-2">
          <FilterPill
            label="All"
            active={active === 'all'}
            onClick={() => setFilter('all')}
            light={light}
          />
          {cats.map((c) => (
            <FilterPill
              key={c.id}
              label={c.label}
              active={active === c.id}
              onClick={() => setFilter(c.id)}
              light={light}
            />
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {tiles.map(({ catId, option }) => (
          <PackageTile
            key={`${catId}:${option.id}`}
            option={option}
            active={(picks[catId] ?? []).includes(option.id)}
            onToggle={() => onToggle(catId, option.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** Single-select filter pill (radio-style) for the tile category filter. */
export function FilterPill({
  label,
  active,
  onClick,
  light = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  light?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className="cursor-pointer rounded-full border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors"
      style={
        active
          ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#08201F' }
          : light
            ? { background: '#FAF7F2', borderColor: '#EBE1CF', color: 'var(--ink)' }
            : {
                background: 'transparent',
                borderColor: 'rgba(255,255,255,.22)',
                color: 'rgba(255,255,255,.75)',
              }
      }
    >
      {label}
    </button>
  );
}

/** A single package card: image carousel, title, description, price + add/added. */
export function PackageTile({
  option,
  active,
  onToggle,
}: {
  option: ServiceOption;
  active: boolean;
  onToggle: () => void;
}) {
  const images = option.images ?? [];
  const [idx, setIdx] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const step = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setIdx((i) => (i + delta + images.length) % images.length);
  };

  return (
    <div
      className="group flex flex-col overflow-hidden rounded-[16px] border-[1.5px] transition-colors"
      style={{ background: '#FAF7F2', borderColor: active ? 'var(--accent)' : '#EBE1CF' }}
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={onToggle}
        className="flex flex-1 flex-col text-left"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/10">
          {images.length > 0 && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={images[idx]}
              alt={option.label}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          )}
          {images.length > 1 && (
            <>
              <span
                role="button"
                tabIndex={-1}
                aria-label="Previous image"
                onClick={step(-1)}
                className="absolute top-1/2 left-1.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Icon name="chevron-left" size={15} />
              </span>
              <span
                role="button"
                tabIndex={-1}
                aria-label="Next image"
                onClick={step(1)}
                className="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Icon name="chevron-right" size={15} />
              </span>
              <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                {images.map((src, i) => (
                  <span
                    key={src}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: i === idx ? 12 : 6,
                      background: i === idx ? '#fff' : 'rgba(255,255,255,.6)',
                    }}
                  />
                ))}
              </div>
            </>
          )}
          {active && (
            <span
              className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full"
              style={{ background: 'var(--accent)', color: '#08201F' }}
            >
              <Icon name="check" size={15} />
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 p-3">
          <div className="flex items-center gap-1.5">
            <Icon name={option.icon} size={15} className="text-ink/70" />
            <span className="text-ink text-[14px] leading-tight font-bold">{option.label}</span>
          </div>
          {option.description && (
            <span className="text-ink/55 text-[12px] leading-snug">{option.description}</span>
          )}
          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            {option.price != null && (
              <span className="text-ink text-[13px] font-extrabold">
                ₹{option.price.toLocaleString('en-IN')}
                <span className="text-ink/45 ml-1 text-[11px] font-medium">onwards</span>
              </span>
            )}
            <span
              className="rounded-full px-2.5 py-1 text-[12px] font-bold"
              style={{
                background: active ? 'var(--accent)' : '#08201F',
                color: active ? '#08201F' : '#fff',
              }}
            >
              {active ? 'Added' : 'Add'}
            </span>
          </div>
        </div>
      </button>
      <div className="flex flex-col gap-2 border-t border-[#EBE1CF] p-3">
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="text-ink/70 hover:text-ink hover:border-accent flex items-center justify-center gap-1.5 rounded-[10px] border border-[#DAD6CC] bg-white py-1.5 text-[12px] font-bold transition-colors"
        >
          <Icon name="list-details" size={14} /> View details
        </button>
      </div>
      {showDetails && (
        <PackageDetails
          option={option}
          active={active}
          onToggle={onToggle}
          onClose={() => setShowDetails(false)}
        />
      )}
    </div>
  );
}

/** Details modal: hero image, itinerary, inclusions and exclusions + add/close. */
export function PackageDetails({
  option,
  active,
  onToggle,
  onClose,
}: {
  option: ServiceOption;
  active: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { itinerary, inclusions, exclusions } = detailsFor(option);
  const hero = option.images?.[0];
  const addToCart = () => {
    if (!active) onToggle();
    onClose();
  };
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[18px] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {hero && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={hero} alt={option.label} className="h-40 w-full object-cover" />
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Icon name={option.icon} size={18} className="text-ink/70" />
              <h2 className="text-ink m-0 font-serif text-[20px] font-bold">{option.label}</h2>
            </div>
            {option.description && (
              <p className="text-ink/60 m-0 text-[13px]">{option.description}</p>
            )}
            {option.price != null && (
              <span className="text-ink text-[14px] font-extrabold">
                ₹{option.price.toLocaleString('en-IN')}
                <span className="text-ink/45 ml-1 text-[11px] font-medium">onwards</span>
              </span>
            )}
          </div>

          <DetailBlock title="Itinerary">
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {itinerary.map((s, i) => (
                <li key={s} className="text-ink/80 flex gap-2.5 text-[13px]">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-[#08201F]"
                    style={{ background: 'var(--accent)' }}
                  >
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </DetailBlock>

          <DetailBlock title="Inclusions">
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {inclusions.map((s) => (
                <li key={s} className="text-ink/80 flex items-start gap-2 text-[13px]">
                  <Icon
                    name="circle-check"
                    size={16}
                    className="mt-0.5 shrink-0"
                    style={{ color: '#1E9E6A' }}
                  />
                  {s}
                </li>
              ))}
            </ul>
          </DetailBlock>

          <DetailBlock title="Exclusions">
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {exclusions.map((s) => (
                <li key={s} className="text-ink/80 flex items-start gap-2 text-[13px]">
                  <Icon
                    name="circle-x"
                    size={16}
                    className="mt-0.5 shrink-0"
                    style={{ color: '#C0392B' }}
                  />
                  {s}
                </li>
              ))}
            </ul>
          </DetailBlock>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#EBE1CF] p-4">
          <Button variant="text" onClick={onClose} sx={{ color: 'var(--ink)', fontWeight: 700 }}>
            Close
          </Button>
          <Button
            variant="contained"
            onClick={addToCart}
            startIcon={<Icon name={active ? 'check' : 'shopping-cart-plus'} size={16} />}
            sx={{
              background: 'linear-gradient(180deg,#e9c97f,#d4a94f)',
              color: '#08201f',
              fontWeight: 800,
              boxShadow: 'none',
              '&:hover': {
                background: 'linear-gradient(180deg,#edd089,#d9af55)',
                boxShadow: 'none',
              },
            }}
          >
            {active ? 'Added' : 'Add to cart'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A titled block inside the details modal. */
export function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
        {title}
      </span>
      {children}
    </div>
  );
}
