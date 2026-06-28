'use client';

import { useAppSelector } from '@/store/hooks';
import { selectFilteredHotels } from '@/store/selectors/hotelSelectors';
import HotelCard from './HotelCard';

/** Filtered hotel listing grid (reflows by width — no breakpoints). */
export default function HotelList() {
  const hotels = useAppSelector(selectFilteredHotels);

  if (hotels.length === 0) {
    return (
      <p className="border-line text-muted rounded-[12px] border border-dashed p-4 text-[13px]">
        No stays match your filters. Try relaxing a filter or raising the price cap.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-muted text-[12.5px] font-bold">
        {hotels.length} {hotels.length === 1 ? 'stay' : 'stays'} in Ooty
      </span>
      <div className="flex flex-col gap-3">
        {hotels.map((h) => (
          <HotelCard key={h.id} hotel={h} />
        ))}
      </div>
    </div>
  );
}
