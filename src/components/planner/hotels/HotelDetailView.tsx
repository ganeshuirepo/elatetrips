'use client';

import Button from '@mui/material/Button';
import { useAppDispatch } from '@/store/hooks';
import { closeHotelDetail } from '@/store/slices/hotelSlice';
import { PROPERTY_TYPES } from '@/data/hotelOptions';
import { inr } from '@/domain/format';
import HotelInlineDetail from './HotelInlineDetail';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import type { Hotel } from '@/domain/types';

const typeName = (id: string) => PROPERTY_TYPES.find((p) => p.id === id)?.name ?? id;

/**
 * Full-page hotel detail — replaces the listing while open. The header
 * carries the essentials and a "Back to hotels" that returns to the list
 * (filters and scroll state live in the store, so nothing is lost).
 */
export default function HotelDetailView({ hotel }: { hotel: Hotel }) {
  const dispatch = useAppDispatch();

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <Button
          variant="text"
          color="primary"
          onClick={() => dispatch(closeHotelDetail())}
          startIcon={<Icon name="arrow-left" size={18} />}
          sx={{ fontWeight: 800, px: 1 }}
        >
          Back to hotels
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-ink font-serif text-[22px] leading-tight font-bold">
            {hotel.name}
          </span>
          <span className="text-muted text-[13px]">
            <span className="text-primary font-bold">{hotel.area}</span> · {typeName(hotel.type)} ·{' '}
            <span className="text-accent-ink">{'★'.repeat(hotel.stars)}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span
              className="rounded-md px-1.5 py-0.5 text-[13px] font-extrabold text-white"
              style={{ background: 'var(--primary)' }}
            >
              {hotel.rating.toFixed(1)}
            </span>
            <span className="text-muted text-[11.5px]">
              ({hotel.reviews.toLocaleString('en-IN')} Ratings)
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-ink text-[18px] leading-tight font-extrabold">
              {inr(hotel.price)}
            </span>
            <span className="text-muted text-[11px]">+ taxes &amp; fees · per night</span>
          </div>
        </div>
      </div>

      <HotelInlineDetail hotel={hotel} />
    </Card>
  );
}
