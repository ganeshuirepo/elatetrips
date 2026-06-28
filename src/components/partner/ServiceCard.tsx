'use client';

import Icon from '@/components/ui/Icon';
import Chip from '@/components/ui/Chip';
import { LabeledInput, LabeledSelect } from './fields';
import { FULFILMENT, LEADTIME, type ServiceDef } from './data';
import type { ServiceState } from './formState';

const toggleArr = (arr: string[], v: string) =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

/** One interest-toggleable celebration service with its detail fields. */
export default function ServiceCard({
  def,
  state,
  onChange,
}: {
  def: ServiceDef;
  state: ServiceState;
  onChange: (patch: Partial<ServiceState>) => void;
}) {
  const showOther = state.packages.includes('__other__');

  return (
    <div
      className="rounded-[14px] border p-[14px] transition-colors"
      style={{
        borderColor: state.on ? 'var(--accent)' : 'var(--line)',
        background: state.on ? 'color-mix(in srgb, var(--accent) 5%, #fff)' : '#fcfcff',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          aria-pressed={state.on}
          onClick={() => onChange({ on: !state.on })}
          className="flex items-center gap-2.5 border-none bg-transparent p-0 text-left"
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-[9px] text-[18px]"
            style={{
              background: state.on ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 14%, #fff)',
              color: state.on ? '#fff' : 'var(--primary)',
            }}
          >
            <Icon name={def.icon} />
          </span>
          <strong className="text-ink text-[14.5px]">{def.label}</strong>
        </button>
        <span
          className="text-[12px] font-bold"
          style={{ color: state.on ? 'var(--accent-ink)' : 'var(--muted)' }}
        >
          {state.on ? 'Interested ✓' : 'Not interested'}
        </span>
      </div>

      {state.on && (
        <div className="mt-3.5 flex flex-col gap-3">
          {def.packages && (
            <div className="text-muted flex flex-col gap-1.5 text-[12px] font-semibold">
              {def.optionsLabel}
              <div className="flex flex-wrap gap-2">
                {def.packages.map((p) => (
                  <Chip
                    key={p}
                    active={state.packages.includes(p)}
                    onClick={() => onChange({ packages: toggleArr(state.packages, p) })}
                    rounded="99px"
                  >
                    {p}
                  </Chip>
                ))}
                <Chip
                  active={showOther}
                  onClick={() => onChange({ packages: toggleArr(state.packages, '__other__') })}
                  rounded="99px"
                >
                  Other
                </Chip>
              </div>
              {showOther && (
                <input
                  value={state.packageOther}
                  onChange={(e) => onChange({ packageOther: e.target.value })}
                  placeholder="Other package — please specify"
                  className="text-ink mt-1 rounded-[10px] border px-3 py-2 text-[14px] outline-none"
                  style={{ borderColor: 'var(--line)' }}
                />
              )}
            </div>
          )}

          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 12rem), 1fr))' }}
          >
            <LabeledSelect
              label="How would you fulfil it?"
              value={state.fulfilment}
              onChange={(v) => onChange({ fulfilment: v })}
              options={FULFILMENT}
            />
            <LabeledSelect
              label="Lead time you need"
              value={state.leadTime}
              onChange={(v) => onChange({ leadTime: v })}
              options={LEADTIME}
            />
            <LabeledInput
              label="Indicative price range (₹)"
              value={state.priceRange}
              onChange={(v) => onChange({ priceRange: v })}
              placeholder="e.g. 2,500–8,000"
            />
            <LabeledInput
              label="Max you can handle per day"
              type="number"
              inputMode="numeric"
              value={state.capacityPerDay}
              onChange={(v) => onChange({ capacityPerDay: v })}
              placeholder="e.g. 5"
            />
          </div>
          <LabeledInput
            label="Notes (inclusions, constraints)"
            value={state.notes}
            onChange={(v) => onChange({ notes: v })}
            placeholder="Optional"
          />
        </div>
      )}
    </div>
  );
}
