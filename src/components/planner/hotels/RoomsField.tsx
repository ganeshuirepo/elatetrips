'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setRooms } from '@/store/slices/planSlice';
import { ROOMS_MAX } from '@/data/constants';

/** Labelled rooms dropdown atop the hotel listing. */
export default function RoomsField() {
  const dispatch = useAppDispatch();
  const rooms = useAppSelector((s) => s.plan.rooms);

  return (
    <label className="flex w-fit flex-col gap-1.5">
      <span className="text-muted text-[10.5px] font-black tracking-[0.05em] uppercase">
        Number of rooms
      </span>
      <select
        value={rooms}
        onChange={(e) => dispatch(setRooms(Number(e.target.value)))}
        className="text-ink min-w-[180px] cursor-pointer rounded-[12px] border border-[#DAD6CC] bg-white px-3.5 py-2.5 text-[14px] font-semibold outline-none"
      >
        {Array.from({ length: ROOMS_MAX }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n} Room{n === 1 ? '' : 's'}
          </option>
        ))}
      </select>
    </label>
  );
}
