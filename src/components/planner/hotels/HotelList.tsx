'use client';

import { useAppSelector } from '@/store/hooks';
import { selectScoredHotels } from '@/store/selectors/hotelSelectors';
import HotelCard from './HotelCard';

/** Filtered + celebration-ranked hotel listing (reflows by width). */
export default function HotelList() {
  const scored = useAppSelector(selectScoredHotels);
  const tailored = scored.some((s) => s.score > 0);

  if (scored.length === 0) {
    return (
      <p className="border-line text-muted rounded-[12px] border border-dashed p-4 text-[13px]">
        No stays match your filters. Try relaxing a filter or raising the price cap.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-muted text-[12.5px] font-bold">
        {scored.length} {scored.length === 1 ? 'stay' : 'stays'} in Ooty
        {tailored && ' · sorted for your celebration'}
      </span>
      <div className="flex flex-col gap-3">
        {scored.map(({ hotel, score, reasons }) => (
          <HotelCard key={hotel.id} hotel={hotel} reasons={reasons} recommended={score >= 3} />
        ))}
      </div>
    </div>
  );
}
