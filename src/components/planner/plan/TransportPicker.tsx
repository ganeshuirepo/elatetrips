'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setTMode } from '@/store/slices/transportSlice';
import Icon from '@/components/ui/Icon';

const MODES = [
  { id: 'own', name: 'Own transport', sub: "No cab needed — we'll skip transport", icon: 'ti-car' },
  {
    id: 'cab',
    name: 'I need a cab',
    sub: 'Complete trip or local trip',
    icon: 'ti-steering-wheel',
  },
] as const;

/** Transport mode selection. Trip type, vehicle, and pickup all live on the Cab step. */
export default function TransportPicker() {
  const dispatch = useAppDispatch();
  const { tMode } = useAppSelector((s) => s.transport);

  const tile = (
    key: string,
    active: boolean,
    icon: string,
    name: string,
    sub: string,
    onClick: () => void,
  ) => (
    <button
      key={key}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="flex flex-1 items-center gap-[11px] rounded-[14px] border-[1.5px] p-[13px] text-left"
      style={{
        borderColor: active ? 'var(--accent)' : 'var(--line)',
        background: active ? 'color-mix(in srgb, var(--accent) 9%, #fff)' : '#fff',
      }}
    >
      <span
        className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] text-[20px]"
        style={{
          background: active ? 'var(--primary)' : 'var(--sand)',
          color: active ? '#fff' : 'var(--primary)',
        }}
      >
        <Icon name={icon} />
      </span>
      <span className="flex flex-col">
        <span className="text-ink text-[14px] font-bold">{name}</span>
        <span className="text-muted text-[12px]">{sub}</span>
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
          Transport
        </span>
        <span className="text-[12.5px] text-white/55">How you&apos;ll get around</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) =>
          tile(m.id, tMode === m.id, m.icon, m.name, m.sub, () => dispatch(setTMode(m.id))),
        )}
      </div>
    </div>
  );
}
