'use client';

import type { ReactNode } from 'react';
import Icon from '@/components/ui/Icon';

/** A bordered panel with a header that toggles its body open/closed. */
export default function CollapsiblePanel({
  open,
  onToggle,
  title,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-line rounded-[14px] border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between border-none bg-transparent p-4 text-left"
      >
        <span className="text-ink text-[14px] font-extrabold">{title}</span>
        <Icon
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          style={{ color: 'var(--muted)' }}
        />
      </button>
      {open && <div className="border-line border-t p-4">{children}</div>}
    </div>
  );
}
