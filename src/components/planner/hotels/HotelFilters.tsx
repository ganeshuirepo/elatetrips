'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleFilter, setHPrice, clearFilters } from '@/store/slices/hotelSlice';
import {
  AMENITIES,
  HOTEL_ACTIVITIES,
  ROOM_SIZES,
  ROOM_VIEWS,
  CLIMATE,
  PROPERTY_TYPES,
} from '@/data/hotelOptions';
import { HOTEL_PRICE_MIN, HOTEL_PRICE_MAX, HOTEL_PRICE_STEP } from '@/data/hotels';
import { inr } from '@/domain/format';
import Chip from '@/components/ui/Chip';
import Icon from '@/components/ui/Icon';
import type { OptionItem } from '@/domain/types';

type FilterKey = 'hStars' | 'hAmen' | 'hAct' | 'hRoomSize' | 'hRoomView' | 'hClimate' | 'hPropType';

/** All hotel preference filters: stars, amenities, rooms, views, climate, type, price. */
export default function HotelFilters() {
  const dispatch = useAppDispatch();
  const h = useAppSelector((s) => s.hotel);

  const group = (label: string, key: FilterKey, items: OptionItem[], selected: string[]) => (
    <div className="flex flex-col gap-2">
      <span className="text-muted text-[11px] font-black tracking-[0.05em] uppercase">{label}</span>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <Chip
            key={it.id}
            active={selected.includes(it.id)}
            onClick={() => dispatch(toggleFilter({ key, value: it.id }))}
          >
            <Icon name={it.icon} size={15} /> {it.name}
          </Chip>
        ))}
      </div>
    </div>
  );

  const pricePct = ((h.hPrice - HOTEL_PRICE_MIN) / (HOTEL_PRICE_MAX - HOTEL_PRICE_MIN)) * 100;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-ink text-[13px] font-extrabold">Refine your stay</span>
        <Button size="small" variant="text" onClick={() => dispatch(clearFilters())}>
          Clear filters
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-muted text-[11px] font-black tracking-[0.05em] uppercase">
          Star rating
        </span>
        <div className="flex flex-wrap gap-2">
          {['3', '4', '5'].map((n) => (
            <Chip
              key={n}
              active={h.hStars.includes(n)}
              onClick={() => dispatch(toggleFilter({ key: 'hStars', value: n }))}
            >
              {n} <span className="text-accent-ink tracking-tight">{'★'.repeat(Number(n))}</span>
            </Chip>
          ))}
        </div>
      </div>

      {group('Property type', 'hPropType', PROPERTY_TYPES, h.hPropType)}
      {group('Amenities', 'hAmen', AMENITIES, h.hAmen)}
      {group('Room types', 'hRoomSize', ROOM_SIZES, h.hRoomSize)}
      {group('Room views', 'hRoomView', ROOM_VIEWS, h.hRoomView)}
      {group('Climate control', 'hClimate', CLIMATE, h.hClimate)}
      {group('On-site activities', 'hAct', HOTEL_ACTIVITIES, h.hAct)}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-muted text-[11px] font-black tracking-[0.05em] uppercase">
            Max nightly price
          </span>
          <span className="text-ink text-[13px] font-extrabold">
            {inr(h.hPrice)}
            {h.hPrice >= HOTEL_PRICE_MAX && '+'}
          </span>
        </div>
        <input
          type="range"
          min={HOTEL_PRICE_MIN}
          max={HOTEL_PRICE_MAX}
          step={HOTEL_PRICE_STEP}
          value={h.hPrice}
          onChange={(e) => dispatch(setHPrice(Number(e.target.value)))}
          aria-label="Max nightly price"
          className="h-[6px] w-full cursor-pointer appearance-none rounded-full outline-none"
          style={{
            accentColor: 'var(--accent)',
            background: `linear-gradient(90deg, var(--accent) ${pricePct}%, color-mix(in srgb, var(--muted) 22%, #fff) ${pricePct}%)`,
          }}
        />
      </div>
    </div>
  );
}
