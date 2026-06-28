'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addGuest, removeGuest, setGuest } from '@/store/slices/reviewSlice';
import Icon from '@/components/ui/Icon';

/** Optionally share the booking with up to two guests. */
export default function ShareGuests() {
  const dispatch = useAppDispatch();
  const guests = useAppSelector((s) => s.review.shareGuests);

  return (
    <div className="border-line flex flex-col gap-3 rounded-[14px] border bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-ink text-[14px] font-extrabold">Share with cotravellers</span>
        <Button
          size="small"
          variant="text"
          disabled={guests.length >= 2}
          onClick={() => dispatch(addGuest())}
          startIcon={<Icon name="user-plus" size={16} />}
        >
          Add cotraveller
        </Button>
      </div>

      {guests.length === 0 && (
        <span className="text-muted text-[12.5px]">No cotravellers added (optional).</span>
      )}

      {guests.map((g, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            value={g.name}
            onChange={(e) => dispatch(setGuest({ index: i, field: 'name', value: e.target.value }))}
            placeholder="Cotraveller name"
            className="border-line flex-1 rounded-[10px] border px-3 py-2 text-[13px] outline-none"
          />
          <input
            inputMode="numeric"
            value={g.phone}
            onChange={(e) =>
              dispatch(setGuest({ index: i, field: 'phone', value: e.target.value }))
            }
            placeholder="Phone"
            className="border-line flex-1 rounded-[10px] border px-3 py-2 text-[13px] outline-none"
          />
          <button
            type="button"
            aria-label="Remove cotraveller"
            onClick={() => dispatch(removeGuest(i))}
            className="text-muted cursor-pointer border-none bg-transparent text-[18px]"
          >
            <Icon name="trash" />
          </button>
        </div>
      ))}
    </div>
  );
}
