'use client';

import type { ReactNode } from 'react';
import Chip from '@/components/ui/Chip';

/**
 * Shared label + error wrapper so every control lines up. `fieldKey` becomes a
 * data attribute the form uses to scroll the first invalid field into view.
 */
function FieldShell({
  label,
  required,
  error,
  hint,
  fieldKey,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  fieldKey?: string;
  children: ReactNode;
}) {
  return (
    <label
      data-field-key={fieldKey}
      className="text-muted flex scroll-mt-24 flex-col gap-1 text-[12px] font-semibold"
    >
      <span>
        {label}
        {required && (
          <span className="text-[#d14343]" aria-hidden>
            {' '}
            *
          </span>
        )}
      </span>
      {children}
      {hint && !error && <span className="text-muted text-[11px] font-medium">{hint}</span>}
      {error && (
        <span role="alert" className="flex items-center gap-1 text-[11.5px] font-semibold text-[#d14343]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7v6M12 16.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {error}
        </span>
      )}
    </label>
  );
}

// 16px on phones so iOS Safari doesn't zoom the page when a field is focused.
const controlCls =
  'text-ink w-full rounded-[10px] border bg-white px-3 py-2.5 text-[16px] outline-none transition-colors sm:py-2 sm:text-[14px]';

const controlStyle = (error?: string) => ({
  borderColor: error ? '#d14343' : 'var(--line)',
  boxShadow: error ? '0 0 0 3px rgba(209,67,67,.08)' : undefined,
});

export function LabeledInput({
  label,
  required,
  error,
  hint,
  fieldKey,
  value,
  onChange,
  onBlur,
  ...rest
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  fieldKey?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'>) {
  return (
    <FieldShell label={label} required={required} error={error} hint={hint} fieldKey={fieldKey}>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        className={controlCls}
        style={{ ...controlStyle(error), ...(rest.style ?? {}) }}
      />
    </FieldShell>
  );
}

export function LabeledSelect({
  label,
  required,
  error,
  fieldKey,
  value,
  onChange,
  onBlur,
  options,
  placeholder = 'Select…',
}: {
  label: string;
  required?: boolean;
  error?: string;
  fieldKey?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <FieldShell label={label} required={required} error={error} fieldKey={fieldKey}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        className={controlCls}
        style={controlStyle(error)}
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
  required,
  error,
  fieldKey,
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  label: string;
  required?: boolean;
  error?: string;
  fieldKey?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}) {
  return (
    <FieldShell label={label} required={required} error={error} fieldKey={fieldKey}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className={`${controlCls} min-h-[68px] resize-y`}
        style={controlStyle(error)}
      />
    </FieldShell>
  );
}

/** Multi-choice chip group (checkbox semantics). */
export function MultiChips({
  label,
  required,
  error,
  hint,
  fieldKey,
  value,
  onChange,
  options,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  fieldKey?: string;
  value: string[];
  onChange: (v: string[]) => void;
  options: string[];
}) {
  const toggle = (o: string) =>
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <FieldShell label={label} required={required} error={error} hint={hint} fieldKey={fieldKey}>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o} active={value.includes(o)} onClick={() => toggle(o)} rounded="99px">
            {o}
          </Chip>
        ))}
      </div>
    </FieldShell>
  );
}

/** Single-choice chip group (radio semantics). */
export function RadioChips({
  label,
  required,
  error,
  fieldKey,
  value,
  onChange,
  options,
  column,
}: {
  label?: string;
  required?: boolean;
  error?: string;
  fieldKey?: string;
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
    <FieldShell label={label} required={required} error={error} fieldKey={fieldKey}>
      {chips}
    </FieldShell>
  );
}
