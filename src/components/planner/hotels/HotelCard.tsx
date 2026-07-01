'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectHotel, toggleHotelExpand } from '@/store/slices/hotelSlice';
import { PROPERTY_TYPES, AMENITIES } from '@/data/hotelOptions';
import { ROOM_META } from '@/data/hotels';
import { inr } from '@/domain/format';
import Icon from '@/components/ui/Icon';
import HotelInlineDetail from './HotelInlineDetail';
import type { Hotel } from '@/domain/types';

const typeName = (id: string) => PROPERTY_TYPES.find((p) => p.id === id)?.name ?? id;
const amenityName = (id: string) => AMENITIES.find((a) => a.id === id)?.name ?? id;

/** OTA-style word label for a numeric rating. */
function ratingLabel(r: number): string {
  if (r >= 4.6) return 'Excellent';
  if (r >= 4.3) return 'Very Good';
  if (r >= 4.0) return 'Good';
  return 'Pleasant';
}

/**
 * A single stay — collapsed summary (image · details · price) that expands
 * inline into the full detail (gallery, rooms, packages, activities). Reason
 * chips show why it fits the chosen celebration.
 */
export default function HotelCard({
  hotel,
  reasons = [],
  recommended = false,
}: {
  hotel: Hotel;
  reasons?: string[];
  recommended?: boolean;
}) {
  const dispatch = useAppDispatch();
  const selected = useAppSelector((s) => s.hotel.hHotel === hotel.id);
  const expanded = useAppSelector((s) => s.hotel.hOpen === hotel.id);
  const room = ROOM_META[hotel.roomSizes[0]];
  const wasPrice = Math.round((hotel.price * 1.18) / 10) * 10;
  const photos = 30 + (hotel.reviews % 70);

  return (
    <div
      className="flex flex-col rounded-[16px] border-[1.5px] p-3 transition-colors"
      style={{
        borderColor: selected || expanded ? 'var(--accent)' : 'var(--line)',
        background:
          selected || expanded ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'transparent',
      }}
    >
      {/* Summary row */}
      <div className="flex flex-wrap gap-4">
        {/* Image */}
        <div className="relative h-[150px] min-w-[180px] flex-[1_1_180px] overflow-hidden rounded-[12px]">
          <div
            className="h-full w-full"
            style={{
              background:
                'linear-gradient(135deg, color-mix(in srgb, var(--primary) 24%, #fff), color-mix(in srgb, var(--accent) 30%, #fff))',
            }}
          />
          {recommended && (
            <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-[var(--primary)] px-2.5 py-1 text-[10.5px] font-extrabold text-white">
              <Icon name="sparkles" size={12} /> Recommended
            </span>
          )}
          <button
            type="button"
            aria-label={selected ? 'Remove from selection' : 'Add to selection'}
            onClick={() => dispatch(selectHotel(hotel.id))}
            className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border-none shadow"
            style={{ background: 'rgba(255,255,255,0.92)', color: selected ? 'var(--accent)' : 'var(--muted)' }}
          >
            <Icon name="heart" size={16} />
          </button>
          <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/65 px-3 py-1 text-[11px] font-bold whitespace-nowrap text-white">
            <Icon name="photo" size={12} /> {photos} Photos &amp; Videos
          </span>
        </div>

        {/* Details */}
        <div className="flex min-w-[180px] flex-[3_1_220px] flex-col gap-2">
          <div className="flex flex-col">
            <span className="text-ink text-[16px] leading-tight font-extrabold">{hotel.name}</span>
            <span className="text-muted text-[12.5px]">
              <span className="text-primary font-bold">{hotel.area}</span> · {typeName(hotel.type)} ·{' '}
              <span className="text-accent-ink">{'★'.repeat(hotel.stars)}</span>
            </span>
          </div>

          {reasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <span
                  key={r}
                  className="flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-bold"
                  style={{
                    color: 'var(--accent-ink)',
                    background: 'color-mix(in srgb, var(--accent) 16%, #fff)',
                  }}
                >
                  <Icon name="sparkles" size={11} /> {r}
                </span>
              ))}
            </div>
          )}

          <span className="text-muted text-[12.5px]">
            1 x ({room.name} · {room.bed})
          </span>

          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#1a8a4a]">
            <Icon name="check" size={14} /> {hotel.tag}
          </span>

          <span className="text-primary flex items-start gap-1.5 text-[12px]">
            <Icon name="sparkles" size={14} className="mt-[1px] flex-none" />
            <span className="font-semibold">
              {hotel.amenities.slice(0, 4).map(amenityName).join(' · ')}
            </span>
          </span>
        </div>

        {/* Price / rating */}
        <div className="flex min-w-[150px] flex-[1_1_150px] flex-col items-end justify-between gap-2">
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-primary text-[12.5px] font-bold">{ratingLabel(hotel.rating)}</span>
              <span
                className="rounded-md px-1.5 py-0.5 text-[12.5px] font-extrabold text-white"
                style={{ background: 'var(--primary)' }}
              >
                {hotel.rating.toFixed(1)}
              </span>
            </div>
            <span className="text-muted text-[11px]">
              ({hotel.reviews.toLocaleString('en-IN')} Ratings)
            </span>
          </div>

          <div className="mt-auto flex flex-col items-end">
            <span className="text-muted text-[12px] line-through">{inr(wasPrice)}</span>
            <span className="text-ink text-[20px] font-extrabold">{inr(hotel.price)}</span>
            <span className="text-muted text-[11px]">+ taxes &amp; fees · per night</span>
          </div>

          <Button
            size="small"
            variant={expanded ? 'contained' : 'outlined'}
            onClick={() => dispatch(toggleHotelExpand(hotel.id))}
            endIcon={<Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} />}
          >
            {expanded ? 'Hide details' : 'View details'}
          </Button>
        </div>
      </div>

      {/* Expanded inline detail */}
      {expanded && <HotelInlineDetail hotel={hotel} />}
    </div>
  );
}
