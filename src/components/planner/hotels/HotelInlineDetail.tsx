'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectRoom } from '@/store/slices/hotelSlice';
import { ROOM_META } from '@/data/hotels';
import { AMENITIES } from '@/data/hotelOptions';
import { hotelImagesFor } from '@/data/hotelImages';
import CelebrationServices from './CelebrationServices';
import { inr } from '@/domain/format';
import Icon from '@/components/ui/Icon';
import type { Hotel, RoomSizeId } from '@/domain/types';

const amenityName = (id: string) => AMENITIES.find((a) => a.id === id)?.name ?? id;

/** Clubbed image gallery — hero + four thumbnails from the shared stock pool. */
function Gallery({ hotel }: { hotel: Hotel }) {
  const [hero, ...thumbs] = hotelImagesFor(hotel.id, 5);
  const photos = 30 + (hotel.reviews % 70);
  return (
    <div className="flex min-w-[220px] flex-[1_1_260px] flex-col gap-2">
      <div className="relative h-[200px] overflow-hidden rounded-[12px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hero} alt={hotel.name} className="h-full w-full object-cover" />
        <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/65 px-3 py-1 text-[11px] font-bold whitespace-nowrap text-white">
          <Icon name="photo" size={12} /> {photos} Photos &amp; Videos
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {thumbs.map((src) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt="" className="h-[52px] w-full rounded-[8px] object-cover" />
        ))}
      </div>
    </div>
  );
}

/** "Choose a room" — every room type visible at once with a Select button. */
function RoomSection({ hotel }: { hotel: Hotel }) {
  const dispatch = useAppDispatch();
  const hRoom = useAppSelector((s) => s.hotel.hRoom);
  const selectedHotel = useAppSelector((s) => s.hotel.hHotel);

  return (
    <div className="flex flex-col gap-2">
      {hotel.roomSizes.map((rid: RoomSizeId) => {
        const meta = ROOM_META[rid];
        const price = Math.round(hotel.price * meta.mult);
        const active = selectedHotel === hotel.id && hRoom === rid;
        return (
          <div
            key={rid}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[12px] border-[1.5px] bg-white px-3.5 py-3"
            style={{ borderColor: active ? 'var(--accent)' : 'var(--line)' }}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Icon name="ti-bed" size={18} style={{ color: 'var(--primary)' }} />
              <div className="flex min-w-0 flex-col">
                <span className="text-ink text-[13.5px] font-extrabold">{meta.name}</span>
                <span className="text-muted text-[12px]">
                  {meta.bed} · {meta.occ} · {meta.sqft} sq ft
                </span>
              </div>
            </div>
            <div className="flex flex-none items-center gap-3">
              <span className="text-ink text-[14px] font-extrabold">{inr(price)}</span>
              <Button
                size="small"
                variant={active ? 'contained' : 'outlined'}
                color="secondary"
                onClick={() => dispatch(selectRoom({ id: hotel.id, room: rid }))}
              >
                {active ? 'Selected' : 'Select room'}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const sectionTitle = (text: string) => (
  <span className="text-ink text-[14px] font-extrabold">{text}</span>
);

/**
 * Inline hotel detail shown when a listing is expanded — room photos clubbed on
 * the left, hotel details (amenities) and room selection on the right.
 */
export default function HotelInlineDetail({ hotel }: { hotel: Hotel }) {
  return (
    <div className="border-line mt-1 flex flex-wrap gap-6 border-t pt-4">
      <Gallery hotel={hotel} />

      <div className="flex min-w-[18rem] flex-[2_1_320px] flex-col gap-6">
        <div className="flex flex-wrap gap-1.5">
          {hotel.amenities.map((a) => (
            <span
              key={a}
              className="bg-sand text-ink rounded-md px-2 py-[3px] text-[11.5px] font-semibold"
            >
              {amenityName(a)}
            </span>
          ))}
        </div>

        <section className="flex flex-col gap-3">
          {sectionTitle('Choose a room')}
          <RoomSection hotel={hotel} />
        </section>

        {/* Every chosen occasion's services are picked here, with the stay. */}
        <CelebrationServices />
      </div>
    </div>
  );
}
