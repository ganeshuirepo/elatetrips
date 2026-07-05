'use client';

import { useState } from 'react';
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
 * An entry the vendor started filling but left unnamed — it would be dropped
 * at submit time, so the form treats it as an error instead of losing it.
 */
export const portfolioItemInvalid = (p: PortfolioItem) =>
  !p.name.trim() && Boolean(p.description.trim() || p.priceRange.trim() || p.link.trim());

/**
 * Repeatable catalogue editor — the vendor's portfolio (packages, vehicle
 * classes, sessions, SKUs…). Labels come from the template so each track reads
 * naturally. Entries with content but no name are flagged rather than
 * silently dropped.
 */
export default function PortfolioEditor({
  config,
  items,
  onChange,
  showErrors = false,
}: {
  config: PortfolioConfig;
  items: PortfolioItem[];
  onChange: (items: PortfolioItem[]) => void;
  /** Reveal name errors on every started entry (set on submit attempt). */
  showErrors?: boolean;
}) {
  const [touched, setTouched] = useState<Set<number>>(new Set());
  const touch = (i: number) => setTouched((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));

  const setItem = (i: number, patch: Partial<PortfolioItem>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const nameError = (i: number) =>
    (showErrors || touched.has(i)) && portfolioItemInvalid(items[i])
      ? `Name this ${config.itemNoun} — unnamed entries aren't saved`
      : undefined;

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-[14px] border p-3.5 sm:p-4"
          style={{
            borderColor: nameError(i) ? '#d14343' : 'var(--line)',
            background: 'var(--sand)',
          }}
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
              onBlur={() => touch(i)}
              placeholder={config.namePlaceholder}
              error={nameError(i)}
            />
            <LabeledInput
              label={config.priceLabel}
              value={item.priceRange}
              onChange={(v) => setItem(i, { priceRange: v })}
              onBlur={() => touch(i)}
              placeholder={config.pricePlaceholder}
            />
            <LabeledInput
              label={config.linkLabel}
              value={item.link}
              onChange={(v) => setItem(i, { link: v })}
              onBlur={() => touch(i)}
              placeholder="https://…"
            />
          </div>
          <LabeledTextarea
            label={config.descLabel}
            value={item.description}
            onChange={(v) => setItem(i, { description: v })}
            onBlur={() => touch(i)}
            placeholder={config.descPlaceholder}
          />
        </div>
      ))}
      <Button
        variant="outlined"
        color="primary"
        onClick={() => onChange([...items, emptyPortfolioItem()])}
        sx={{
          alignSelf: { xs: 'stretch', sm: 'flex-start' },
          textTransform: 'none',
          fontWeight: 700,
        }}
      >
        + Add {config.itemNoun}
      </Button>
    </div>
  );
}
