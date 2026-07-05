'use client';

import Button from '@mui/material/Button';
import type { PortfolioItem } from '@/store/elateApi';
import type { PortfolioConfig } from './templates';
import Icon from '@/components/ui/Icon';
import { LabeledInput, LabeledTextarea } from './fields';

export const emptyPortfolioItem = (): PortfolioItem => ({
  name: '',
  description: '',
  priceRange: '',
  link: '',
});

/**
 * Repeatable catalogue editor — the vendor's portfolio (packages, vehicle
 * classes, sessions, SKUs…). Labels come from the template so each track reads
 * naturally. Items without a name are dropped at submit time.
 */
export default function PortfolioEditor({
  config,
  items,
  onChange,
}: {
  config: PortfolioConfig;
  items: PortfolioItem[];
  onChange: (items: PortfolioItem[]) => void;
}) {
  const setItem = (i: number, patch: Partial<PortfolioItem>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-[14px] border p-4"
          style={{ borderColor: 'var(--line)', background: 'var(--sand)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-accent-ink text-[11px] font-black tracking-[0.06em] uppercase">
              {config.itemNoun} {i + 1}
            </span>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="text-muted flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[12px] font-bold hover:text-[#d14343]"
            >
              <Icon name="trash" size={14} /> Remove
            </button>
          </div>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))' }}
          >
            <LabeledInput
              label={config.nameLabel}
              value={item.name}
              onChange={(v) => setItem(i, { name: v })}
              placeholder={config.namePlaceholder}
            />
            <LabeledInput
              label={config.priceLabel}
              value={item.priceRange}
              onChange={(v) => setItem(i, { priceRange: v })}
              placeholder={config.pricePlaceholder}
            />
            <LabeledInput
              label={config.linkLabel}
              value={item.link}
              onChange={(v) => setItem(i, { link: v })}
              placeholder="https://…"
            />
          </div>
          <LabeledTextarea
            label={config.descLabel}
            value={item.description}
            onChange={(v) => setItem(i, { description: v })}
            placeholder={config.descPlaceholder}
          />
        </div>
      ))}
      <Button
        variant="outlined"
        color="primary"
        onClick={() => onChange([...items, emptyPortfolioItem()])}
        sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 700 }}
      >
        + Add {config.itemNoun}
      </Button>
    </div>
  );
}
