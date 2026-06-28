'use client';

import type { ReactNode } from 'react';

/** Selectable pill used across hotel filters and option toggles. */
export default function Chip({
  active,
  onClick,
  children,
  rounded = '11px',
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  rounded?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="inline-flex items-center gap-[7px] border-[1.5px] px-[13px] py-[9px] text-[13px] font-bold transition-colors"
      style={{
        borderRadius: rounded,
        borderColor: active ? 'var(--accent)' : 'var(--line)',
        background: active ? 'color-mix(in srgb, var(--accent) 9%, #fff)' : '#fff',
        color: active ? 'var(--accent-ink)' : 'var(--ink)',
      }}
    >
      {children}
    </button>
  );
}
