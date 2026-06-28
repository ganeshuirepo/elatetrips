'use client';

import { useMemo, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectDest, setDestQuery, clearDest } from '@/store/slices/planSlice';
import { openOnly, setPopover } from '@/store/slices/uiSlice';
import { DESTINATIONS } from '@/data/destinations';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import Icon from '@/components/ui/Icon';

/** Destination typeahead with live + coming-soon results. */
export default function DestinationSearch() {
  const dispatch = useAppDispatch();
  const { dest, destQuery } = useAppSelector((s) => s.plan);
  const open = useAppSelector((s) => s.ui.destOpen);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => dispatch(setPopover({ key: 'destOpen', open: false })), open);

  const q = destQuery.trim().toLowerCase();
  const matches = useMemo(
    () =>
      DESTINATIONS.filter(
        (d) => !q || d.name.toLowerCase().includes(q) || d.tag.toLowerCase().includes(q),
      ),
    [q],
  );
  const hasDest = dest.length > 0;

  return (
    <div data-dest ref={ref} className="relative">
      <div className="relative">
        <span className="text-muted pointer-events-none absolute top-1/2 left-[15px] -translate-y-1/2 text-[19px]">
          <Icon name="map-pin" />
        </span>
        <input
          value={destQuery}
          placeholder="Search a destination — try Ooty"
          onFocus={() => dispatch(openOnly('destOpen'))}
          onChange={(e) => {
            dispatch(setDestQuery(e.target.value));
            dispatch(openOnly('destOpen'));
          }}
          className="text-ink w-full rounded-[14px] border-[1.5px] bg-white py-[14px] pr-[42px] pl-[44px] text-[15px] font-semibold outline-none"
          style={{
            borderColor: hasDest ? 'var(--primary)' : 'var(--line)',
            boxShadow: open
              ? '0 0 0 3px color-mix(in srgb, var(--primary) 10%, transparent)'
              : 'none',
          }}
        />
        {hasDest && (
          <button
            type="button"
            aria-label="Clear destination"
            onClick={() => {
              dispatch(clearDest());
              dispatch(openOnly('destOpen'));
            }}
            className="text-muted absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer border-none bg-transparent text-[18px]"
          >
            <Icon name="x" />
          </button>
        )}
      </div>

      {open && (
        <div
          className="border-line absolute top-[calc(100%+8px)] right-0 left-0 z-20 rounded-[14px] border bg-white p-2 shadow-xl"
          role="listbox"
        >
          {matches.map((d) => {
            const selected = dest.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={!d.on}
                onClick={
                  d.on
                    ? () => {
                        dispatch(selectDest({ id: d.id, name: d.name }));
                        dispatch(setPopover({ key: 'destOpen', open: false }));
                      }
                    : undefined
                }
                className="flex w-full items-center gap-[11px] rounded-[11px] border-none bg-transparent p-[10px] text-left disabled:cursor-not-allowed disabled:opacity-60"
                style={{ cursor: d.on ? 'pointer' : 'not-allowed' }}
              >
                <span
                  className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] text-[20px]"
                  style={{
                    background: selected ? 'var(--primary)' : 'var(--sand)',
                    color: selected ? '#fff' : 'var(--primary)',
                  }}
                >
                  <Icon name={d.icon} />
                </span>
                <span className="flex flex-col">
                  <span className="text-ink text-[14.5px] font-bold">{d.name}</span>
                  <span className="text-muted text-[12.5px]">
                    {d.tag}
                    {!d.on && ' · Coming soon'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
