'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { stepRooms } from '@/store/slices/planSlice';
import Stepper from '@/components/ui/Stepper';
import { ROOMS_MAX } from '@/data/constants';

/** Room-count stepper — lives with the stay, next to the hotel picking. */
export default function RoomsField() {
  const dispatch = useAppDispatch();
  const rooms = useAppSelector((s) => s.plan.rooms);

  return (
    <div className="border-line flex min-w-[220px] max-w-[320px] items-center justify-between gap-3 rounded-[14px] border-[1.5px] bg-white px-4 py-[11px]">
      <span className="flex flex-col">
        <span className="text-muted block text-[10.5px] font-black tracking-[0.05em] uppercase">
          Rooms
        </span>
        <span className="text-ink text-[16px] leading-[1.1] font-bold">
          {rooms} Room{rooms === 1 ? '' : 's'}
        </span>
      </span>
      <Stepper
        ariaLabel="Rooms"
        value={rooms}
        min={1}
        max={ROOMS_MAX}
        onDec={() => dispatch(stepRooms(-1))}
        onInc={() => dispatch(stepRooms(1))}
      />
    </div>
  );
}
