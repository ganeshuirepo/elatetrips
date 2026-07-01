'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectRoom } from '@/store/slices/hotelSlice';
import { ROOM_META } from '@/data/hotels';
import { AMENITIES } from '@/data/hotelOptions';
import { inr } from '@/domain/format';
import Icon from '@/components/ui/Icon';
import ExpandableRow from '@/components/ui/ExpandableRow';
import CelebrationPackages from './CelebrationPackages';
import ActivitiesExperiences from './ActivitiesExperiences';
import type { Hotel, RoomSizeId } from '@/domain/types';

const amenityName = (id: string) => AMENITIES.find((a) => a.id === id)?.name ?? id;

/** Clubbed image gallery (placeholder gradients) shown on the left when expanded. */
const GALLERY = [
  'linear-gradient(135deg, #1f4a44, #c9a45a)',
  'linear-gradient(135deg, #2b5c54, #e7c572)',
  'linear-gradient(135deg, #394f39, #bfa15a)',
  'linear-gradient(135deg, #4a3f2f, #d4a94f)',
  'linear-gradient(135deg, #143a3c, #9c7c33)',
];

function Gallery({ hotel }: { hotel: Hotel }) {
  const seed = hotel.id.charCodeAt(hotel.id.length - 1);
  const grad = (i: number) => GALLERY[(seed + i) % GALLERY.length];
  const photos = 30 + (hotel.reviews % 70);
  return (
    <div className="flex min-w-[220px] flex-[1_1_260px] flex-col gap-2">
      <div className="relative h-[200px] overflow-hidden rounded-[12px]" style={{ background: grad(0) }}>
        <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/65 px-3 py-1 text-[11px] font-bold whitespace-nowrap text-white">
          <Icon name="photo" size={12} /> {photos} Photos &amp; Videos
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((k) => (
          <div key={k} className="h-[52px] rounded-[8px]" style={{ background: grad(k) }} />
        ))}
      </div>
    </div>
  );
}

/** "Choose a room" — each room type is an expandable row with a Select button. */
function RoomSection({ hotel }: { hotel: Hotel }) {
  const dispatch = useAppDispatch();
  const hRoom = useAppSelector((s) => s.hotel.hRoom);
  const selectedHotel = useAppSelector((s) => s.hotel.hHotel);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="flex flex-col gap-2">
      {hotel.roomSizes.map((rid: RoomSizeId) => {
        const meta = ROOM_META[rid];
        const price = Math.round(hotel.price * meta.mult);
        const active = selectedHotel === hotel.id && hRoom === rid;
        return (
          <ExpandableRow
            key={rid}
            open={!!open[rid]}
            onToggle={() => setOpen((o) => ({ ...o, [rid]: !o[rid] }))}
            icon="ti-bed"
            title={meta.name}
            subtitle={`${meta.sqft} sq ft · ${meta.occ}`}
            active={active}
            right={<span className="text-ink text-[14px] font-extrabold">{inr(price)}</span>}
          >
            <div className="flex flex-col gap-3">
              <div className="text-muted flex flex-col gap-1 text-[12px]">
                <span className="flex items-center gap-1.5">
                  <Icon name="ti-bed" size={13} style={{ color: 'var(--accent)' }} /> {meta.bed}
                </span>
                <span className="flex items-center gap-1.5">
                  <Icon name="ti-users-group" size={13} style={{ color: 'var(--accent)' }} />{' '}
                  {meta.occ}
                </span>
                <span className="flex items-center gap-1.5">
                  <Icon name="ti-ruler-2" size={13} style={{ color: 'var(--accent)' }} /> {meta.sqft}{' '}
                  sq ft
                </span>
              </div>
              <Button
                size="small"
                variant={active ? 'contained' : 'outlined'}
                color="secondary"
                onClick={() => dispatch(selectRoom({ id: hotel.id, room: rid }))}
              >
                {active ? 'Selected' : 'Select room'}
              </Button>
            </div>
          </ExpandableRow>
        );
      })}
    </div>
  );
}

const sectionTitle = (text: string) => (
  <span className="text-ink text-[14px] font-extrabold">{text}</span>
);

/**
 * Inline hotel detail shown when a listing is expanded — images clubbed on the
 * left, room selection + celebration packages + activities on the right.
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

        <section className="flex flex-col gap-3">
          {sectionTitle('Celebration packages')}
          <CelebrationPackages celebFilter={[]} categoryFilter={[]} />
        </section>

        <section className="flex flex-col gap-3">
          {sectionTitle('Activities & experiences')}
          <ActivitiesExperiences kind="all" categoryFilter={[]} />
        </section>
      </div>
    </div>
  );
}
