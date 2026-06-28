'use client';

import type { ReactNode } from 'react';
import Chip from '@/components/ui/Chip';

/** Shared label + error wrapper so every control lines up. */
function FieldShell({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="text-muted flex flex-col gap-1 text-[12px] font-semibold">
      <span>
        {label}
        {required && <span className="text-[#d14343]"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="text-muted text-[11px] font-medium">{hint}</span>}
      {error && <span className="text-[11.5px] font-semibold text-[#d14343]">{error}</span>}
    </label>
  );
}

const controlCls =
  'text-ink rounded-[10px] border bg-white px-3 py-2 text-[14px] outline-none transition-colors';

export function LabeledInput({
  label,
  required,
  error,
  hint,
  value,
  onChange,
  ...rest
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <FieldShell label={label} required={required} error={error} hint={hint}>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={controlCls}
        style={{ borderColor: error ? '#d14343' : 'var(--line)' }}
      />
    </FieldShell>
  );
}

export function LabeledSelect({
  label,
  required,
  error,
  value,
  onChange,
  options,
  placeholder = 'Select…',
}: {
  label: string;
  required?: boolean;
  error?: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <FieldShell label={label} required={required} error={error}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={controlCls}
        style={{ borderColor: error ? '#d14343' : 'var(--line)' }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function LabeledTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <FieldShell label={label}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${controlCls} min-h-[68px] resize-y`}
        style={{ borderColor: 'var(--line)' }}
      />
    </FieldShell>
  );
}

/** Single-choice chip group (radio semantics). */
export function RadioChips({
  label,
  required,
  error,
  value,
  onChange,
  options,
  column,
}: {
  label?: string;
  required?: boolean;
  error?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  column?: boolean;
}) {
  const chips = (
    <div className={`flex ${column ? 'flex-col items-stretch' : 'flex-wrap'} gap-2`}>
      {options.map((o) => (
        <Chip key={o.value} active={value === o.value} onClick={() => onChange(o.value)} rounded="99px">
          {o.label}
        </Chip>
      ))}
    </div>
  );
  if (!label) return chips;
  return (
    <FieldShell label={label} required={required} error={error}>
      {chips}
    </FieldShell>
  );
}
