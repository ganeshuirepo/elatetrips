'use client';

import IconButton from '@mui/material/IconButton';
import Icon from './Icon';

/** Plus/minus numeric stepper used for travellers and headcounts. */
export default function Stepper({
  value,
  onDec,
  onInc,
  min = 0,
  max = Infinity,
  ariaLabel,
}: {
  value: number;
  onDec: () => void;
  onInc: () => void;
  min?: number;
  max?: number;
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3" role="group" aria-label={ariaLabel}>
      <IconButton
        size="small"
        onClick={onDec}
        disabled={value <= min}
        aria-label="decrease"
        sx={{ border: '1.5px solid #D5D2C8', color: 'var(--primary)', width: 34, height: 34 }}
      >
        <Icon name="minus" size={16} />
      </IconButton>
      <span className="min-w-[20px] text-center text-[15px] font-extrabold tabular-nums">
        {value}
      </span>
      <IconButton
        size="small"
        onClick={onInc}
        disabled={value >= max}
        aria-label="increase"
        sx={{ border: '1.5px solid #D5D2C8', color: 'var(--primary)', width: 34, height: 34 }}
      >
        <Icon name="plus" size={16} />
      </IconButton>
    </div>
  );
}
