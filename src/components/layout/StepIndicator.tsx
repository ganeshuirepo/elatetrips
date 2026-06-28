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

/** Numbered breadcrumb of wizard steps with reachability-aware navigation. */
export default function StepIndicator({ steps, onNavigate }: StepIndicatorProps) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-[6px]">
      {steps.map((st, i) => {
        const clickable = st.state === 'reachable' || st.state === 'done';
        const labelColor =
          st.state === 'active'
            ? 'text-primary'
            : clickable
              ? 'cursor-pointer text-muted'
              : 'text-[#B8B4A8]';
        const numClass =
          st.state === 'active'
            ? 'bg-primary text-white'
            : st.state === 'done'
              ? 'bg-accent text-white'
              : clickable
                ? 'bg-sand text-primary'
                : 'bg-[#EFEBE1] text-[#B8B4A8]';
        return (
          <Fragment key={st.id}>
            <button
              type="button"
              disabled={!clickable && st.state !== 'active'}
              onClick={clickable ? () => onNavigate(st.id) : undefined}
              className={`inline-flex items-center gap-[7px] border-none bg-transparent px-1 py-[6px] text-[12.5px] font-extrabold ${labelColor}`}
            >
              <span
                className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[11px] font-black ${numClass}`}
              >
                {i + 1}
              </span>
              {st.label}
            </button>
            {i < steps.length - 1 && (
              <Icon name="chevron-right" size={14} style={{ color: '#C9C4B7' }} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
