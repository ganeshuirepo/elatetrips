'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { closeHotelDetail, selectRoom } from '@/store/slices/hotelSlice';
import { selectOpenHotel } from '@/store/selectors/hotelSelectors';
import { selectCelebPackageGroups } from '@/store/selectors/addonsSelectors';
import { ROOM_META } from '@/data/hotels';
import { AMENITIES } from '@/data/hotelOptions';
import { CELEBRATIONS } from '@/data/celebrations';
import { PKG_CATEGORIES, pkgCategory } from '@/data/packages';
import { ADVENTURES, EXPERIENCES, ACTIVITY_CATEGORIES } from '@/data/activities';
import { inr } from '@/domain/format';
import Icon from '@/components/ui/Icon';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import ExpandableRow from '@/components/ui/ExpandableRow';
import CelebrationPackages from './CelebrationPackages';
import ActivitiesExperiences, { type ActivityKind } from './ActivitiesExperiences';
import type { Hotel, RoomSizeId } from '@/domain/types';

const toggle = (arr: string[], v: string) =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

/** "Choose a room" — each room type is an expandable row. */
function RoomSection({ hotel, filter }: { hotel: Hotel; filter: string[] }) {
  const dispatch = useAppDispatch();
  const hRoom = useAppSelector((s) => s.hotel.hRoom);
  const selectedHotel = useAppSelector((s) => s.hotel.hHotel);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const rooms = filter.length
    ? hotel.roomSizes.filter((r) => filter.includes(r))
    : hotel.roomSizes;

  if (rooms.length === 0) {
    return <p className="text-muted text-[13px]">No room types match the filter.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {rooms.map((rid: RoomSizeId) => {
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

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted text-[11px] font-black tracking-[0.05em] uppercase">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

const KINDS: { id: ActivityKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'adventure', label: 'Adventures' },
  { id: 'experience', label: 'Experiences' },
];

/** Full hotel detail screen — filter sidebar + expandable rooms, packages, activities. */
export default function HotelDetail() {
  const dispatch = useAppDispatch();
  const hotel = useAppSelector(selectOpenHotel);
  const celebGroups = useAppSelector(selectCelebPackageGroups);

  const [roomFilter, setRoomFilter] = useState<string[]>([]);
  const [celebFilter, setCelebFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [kind, setKind] = useState<ActivityKind>('all');
  const [actCategoryFilter, setActCategoryFilter] = useState<string[]>([]);

  // Categories actually present among the available celebration packages.
  const presentCategories = (() => {
    const set = new Set<string>();
    celebGroups.forEach((g) => g.names.forEach((n) => set.add(pkgCategory(n))));
    return PKG_CATEGORIES.filter((c) => set.has(c));
  })();

  // Activity categories present given the chosen kind (adventures / experiences).
  const presentActCategories = (() => {
    const set = new Set<string>();
    if (kind !== 'experience') ADVENTURES.forEach((v) => set.add(v.category));
    if (kind !== 'adventure') EXPERIENCES.forEach((v) => set.add(v.category));
    return ACTIVITY_CATEGORIES.filter((c) => set.has(c));
  })();

  if (!hotel) return null;

  const sectionTitle = (text: string) => (
    <span className="text-ink text-[14px] font-extrabold">{text}</span>
  );

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={() => dispatch(closeHotelDetail())}
        className="text-primary flex w-fit items-center gap-1.5 border-none bg-transparent p-0 text-[13px] font-bold"
      >
        <Icon name="arrow-left" size={16} /> Back to stays
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-primary m-0 font-serif text-2xl font-bold tracking-[-0.01em]">
            {hotel.name}
          </h2>
          <span className="text-muted text-[13px]">
            {hotel.area} · {'★'.repeat(hotel.stars)} · {hotel.rating.toFixed(1)} (
            {hotel.reviews.toLocaleString('en-IN')} reviews)
          </span>
        </div>
        <span className="bg-sand text-accent-ink rounded-full px-3 py-1 text-[12px] font-bold">
          {hotel.tag}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {hotel.amenities.map((a) => (
          <span
            key={a}
            className="bg-sand text-ink rounded-md px-2 py-[3px] text-[11.5px] font-semibold"
          >
            {AMENITIES.find((x) => x.id === a)?.name ?? a}
          </span>
        ))}
      </div>

      {/* Filters + sections — reflow by width, no breakpoints */}
      <div className="flex flex-wrap gap-6">
        <Card className="min-w-[13rem] flex-[1_1_13rem] self-start">
          <div className="flex flex-col gap-5">
            <span className="text-ink text-[13px] font-extrabold">Filter this stay</span>

            <FilterGroup label="Room type">
              {hotel.roomSizes.map((rid) => (
                <Chip
                  key={rid}
                  active={roomFilter.includes(rid)}
                  onClick={() => setRoomFilter((f) => toggle(f, rid))}
                >
                  {ROOM_META[rid].name}
                </Chip>
              ))}
            </FilterGroup>

            <FilterGroup label="Celebrations">
              {celebGroups.length === 0 ? (
                <span className="text-muted text-[12px]">Pick celebrations on the Plan step.</span>
              ) : (
                celebGroups.map(({ celebId }) => {
                  const celeb = CELEBRATIONS.find((c) => c.id === celebId)!;
                  return (
                    <Chip
                      key={celebId}
                      active={celebFilter.includes(celebId)}
                      onClick={() => setCelebFilter((f) => toggle(f, celebId))}
                    >
                      <Icon name={celeb.icon} size={14} /> {celeb.name}
                    </Chip>
                  );
                })
              )}
            </FilterGroup>

            {presentCategories.length > 0 && (
              <FilterGroup label="Package category">
                {presentCategories.map((c) => (
                  <Chip
                    key={c}
                    active={categoryFilter.includes(c)}
                    onClick={() => setCategoryFilter((f) => toggle(f, c))}
                  >
                    {c}
                  </Chip>
                ))}
              </FilterGroup>
            )}

            <FilterGroup label="Activities">
              {KINDS.map((k) => (
                <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
                  {k.label}
                </Chip>
              ))}
            </FilterGroup>

            {presentActCategories.length > 0 && (
              <FilterGroup label="Activity category">
                {presentActCategories.map((c) => (
                  <Chip
                    key={c}
                    active={actCategoryFilter.includes(c)}
                    onClick={() => setActCategoryFilter((f) => toggle(f, c))}
                  >
                    {c}
                  </Chip>
                ))}
              </FilterGroup>
            )}
          </div>
        </Card>

        <div className="flex min-w-[18rem] flex-[3_1_22rem] flex-col gap-6">
          <section className="flex flex-col gap-3">
            {sectionTitle('Choose a room')}
            <RoomSection hotel={hotel} filter={roomFilter} />
          </section>

          <section className="flex flex-col gap-3">
            {sectionTitle('Celebration packages')}
            <CelebrationPackages celebFilter={celebFilter} categoryFilter={categoryFilter} />
          </section>

          <section className="flex flex-col gap-3">
            {sectionTitle('Activities & experiences')}
            <ActivitiesExperiences kind={kind} categoryFilter={actCategoryFilter} />
          </section>
        </div>
      </div>
    </div>
  );
}
