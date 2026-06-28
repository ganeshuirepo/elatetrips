'use client';

import type { ReactNode } from 'react';
import Icon from '@/components/ui/Icon';

/**
 * A single-line listing that expands to a detail row on click. The header holds
 * an icon, title/subtitle and a compact `right` slot (price/status); all
 * interactive actions live in the expanded body to avoid nested buttons.
 */
export default function ExpandableRow({
  open,
  onToggle,
  icon,
  title,
  subtitle,
  right,
  active = false,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  active?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-[12px] border-[1.5px] bg-white"
      style={{ borderColor: active ? 'var(--accent)' : 'var(--line)' }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 border-none bg-transparent p-3 text-left"
      >
        {icon && (
          <span
            className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] text-[18px]"
            style={{ background: 'var(--sand)', color: 'var(--primary)' }}
          >
            <Icon name={icon} />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-ink truncate text-[13.5px] font-bold">{title}</span>
          {subtitle && <span className="text-muted truncate text-[12px]">{subtitle}</span>}
        </span>
        {right && <span className="flex flex-none items-center gap-2">{right}</span>}
        <Icon
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          style={{ color: 'var(--muted)' }}
        />
      </button>
      {open && <div className="border-line border-t p-3">{children}</div>}
    </div>
  );
}
