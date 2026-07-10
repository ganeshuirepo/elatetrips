'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleSvcPick } from '@/store/slices/servicesSlice';
import { CATEGORY_BY_ID } from '@/data/services';
import { OccasionTiles } from './PackageTiles';

/**
 * On-ground Services tab — photographers, videographers, makeup artists and
 * other on-location crews. Occasion-independent: add any of them alone or
 * alongside anything else in the cart.
 */
export default function OnGroundTab() {
  const dispatch = useAppDispatch();
  const picks = useAppSelector((s) => s.services.picks);
  const onground = CATEGORY_BY_ID['onground'];

  if (!onground) return null;

  return (
    <div className="flex max-w-[804px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
          On-ground services
        </span>
        <span className="text-[13px] text-white/60">
          Professional crews on location — photography, film, styling and more, for any moment of
          your trip.
        </span>
      </div>

      <OccasionTiles
        cats={[onground]}
        picks={picks}
        onToggle={(cat, oid) => dispatch(toggleSvcPick({ cat, id: oid }))}
      />
    </div>
  );
}
