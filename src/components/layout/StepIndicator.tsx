'use client';

import { Fragment } from 'react';
import Icon from '@/components/ui/Icon';
import type { WizardStep } from '@/store/slices/uiSlice';

export type StepState = 'active' | 'done' | 'reachable' | 'locked';

export interface StepItem {
  id: WizardStep;
  label: string;
  state: StepState;
}

export interface StepIndicatorProps {
  steps: StepItem[];
  onNavigate: (id: WizardStep) => void;
}

/**
 * Numbered breadcrumb of wizard steps with reachability-aware navigation.
 * Rendered directly on the dark luxury canvas, so colours are light/gold.
 */
export default function StepIndicator({ steps, onNavigate }: StepIndicatorProps) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-1 gap-y-2">
      {steps.map((st, i) => {
        const clickable = st.state === 'reachable' || st.state === 'done';
        const labelColor =
          st.state === 'active'
            ? 'text-white'
            : clickable
              ? 'cursor-pointer text-white/60 hover:text-white/90'
              : 'text-white/30';
        const badge =
          st.state === 'active'
            ? 'bg-[var(--accent)] text-[#08201F] shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_22%,transparent)]'
            : st.state === 'done'
              ? 'bg-[color-mix(in_srgb,var(--accent)_80%,#fff)] text-[#08201F]'
              : clickable
                ? 'border border-white/30 bg-white/5 text-white/75'
                : 'border border-white/12 bg-white/5 text-white/30';
        return (
          <Fragment key={st.id}>
            <button
              type="button"
              disabled={!clickable && st.state !== 'active'}
              onClick={clickable ? () => onNavigate(st.id) : undefined}
              className={`inline-flex items-center gap-[8px] border-none bg-transparent px-1.5 py-[6px] text-[12.5px] font-extrabold tracking-wide transition-colors ${labelColor}`}
            >
              <span
                className={`flex h-[24px] w-[24px] flex-none items-center justify-center rounded-full text-[11px] font-black transition-all ${badge}`}
              >
                {st.state === 'done' ? <Icon name="check" size={13} /> : i + 1}
              </span>
              {st.label}
            </button>
            {i < steps.length - 1 && (
              <Icon name="chevron-right" size={14} style={{ color: 'rgba(255,255,255,.28)' }} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
