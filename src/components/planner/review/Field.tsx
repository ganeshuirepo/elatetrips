'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import Required from '@/components/ui/Required';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  /** Marks the label with the app-wide mandatory asterisk. */
  required?: boolean;
}

/**
 * Native labelled text input matching the app's form style (label above the
 * field). Used instead of MUI's outlined TextField, whose notched-outline label
 * collides with Tailwind's preflight reset.
 */
const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, required, ...rest },
  ref,
) {
  return (
    <label className="text-muted flex flex-col gap-1 text-[12px] font-semibold">
      <span>
        {label}
        {required && <Required />}
      </span>
      <input
        ref={ref}
        {...rest}
        className="text-ink rounded-[10px] border px-3 py-2 text-[14px] outline-none"
        style={{ borderColor: error ? '#d14343' : 'var(--line)' }}
      />
      {error && <span className="text-[11.5px] font-semibold text-[#d14343]">{error}</span>}
    </label>
  );
});

export default Field;
