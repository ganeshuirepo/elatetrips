import { useEffect, type RefObject } from 'react';

/**
 * Calls `onOutside` when a pointer-down lands outside the referenced element.
 * Replaces the original global document mousedown handler with a scoped,
 * self-cleaning effect per popover.
 */
export function useOutsideClick<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onOutside: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onOutside, active]);
}
