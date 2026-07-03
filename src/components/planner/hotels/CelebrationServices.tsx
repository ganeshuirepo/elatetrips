'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleSvcPick } from '@/store/slices/servicesSlice';
import {
  CATEGORY_BY_ID,
  TILE_CATEGORIES,
  OCCASION_TILES,
  templateFor,
  type ServiceCategory,
} from '@/data/services';
import { CELEBRATIONS } from '@/data/celebrations';
import { OccasionTiles } from '@/components/planner/services/PackageTiles';
import Icon from '@/components/ui/Icon';

const NAME_BY_ID = Object.fromEntries(CELEBRATIONS.map((c) => [c.id, c.name]));
const ICON_BY_ID = Object.fromEntries(CELEBRATIONS.map((c) => [c.id, c.icon]));
const CATEGORY_OF = Object.fromEntries(CELEBRATIONS.map((c) => [c.id, c.category]));

/**
 * All services for the occasions chosen on Plan, shown inside the expanded
 * hotel detail — one tile block per celebration plus a combined Escapes
 * block. Selection state is the trip-wide services picks.
 */
export default function CelebrationServices() {
  const dispatch = useAppDispatch();
  const celebs = useAppSelector((s) => s.plan.celebs);
  const picks = useAppSelector((s) => s.services.picks);

  const celebrationIds = celebs.filter((id) => CATEGORY_OF[id] !== 'rejuvenate');
  const escapeIds = celebs.filter((id) => CATEGORY_OF[id] === 'rejuvenate');

  // The occasion's template sections plus the shared celebration categories.
  // Selection state is shared trip-wide, so each category is rendered only
  // under the first celebration that declares it.
  const sectionsFor = (id: string): string[] => {
    const bucket = TILE_CATEGORIES[CATEGORY_OF[id] ?? 'celebration'] ?? [];
    return [...templateFor(id).sections, ...bucket].filter((s, i, a) => a.indexOf(s) === i);
  };
  const sectionOwner = new Map<string, string>();
  celebrationIds.forEach((id) =>
    sectionsFor(id).forEach((s) => {
      if (!sectionOwner.has(s)) sectionOwner.set(s, id);
    }),
  );

  const escapeCats = escapeIds
    .flatMap((id) => OCCASION_TILES[id] ?? [])
    .filter((c, i, a) => a.indexOf(c) === i)
    .map((cid) => CATEGORY_BY_ID[cid])
    .filter(Boolean) as ServiceCategory[];

  const blocks = celebrationIds
    .map((id) => ({
      id,
      cats: sectionsFor(id)
        .filter((s) => sectionOwner.get(s) === id)
        .map((s) => CATEGORY_BY_ID[s])
        .filter(Boolean) as ServiceCategory[],
    }))
    .filter((b) => b.cats.length > 0);

  if (blocks.length === 0 && escapeCats.length === 0) return null;

  const onToggle = (cat: string, oid: string) => dispatch(toggleSvcPick({ cat, id: oid }));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-ink text-[14px] font-extrabold">Celebration services</span>
        <span className="text-muted text-[12.5px]">
          Add the touches you&apos;d like — we&apos;ll arrange them with this stay.
        </span>
      </div>

      {blocks.map(({ id, cats }) => (
        <div key={id} className="flex flex-col gap-2">
          <span className="text-ink flex items-center gap-2 text-[13px] font-extrabold">
            <Icon name={ICON_BY_ID[id]} size={16} style={{ color: 'var(--accent-ink)' }} />
            {NAME_BY_ID[id] ?? id}
          </span>
          <OccasionTiles cats={cats} picks={picks} onToggle={onToggle} light />
        </div>
      ))}

      {escapeCats.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-ink flex items-center gap-2 text-[13px] font-extrabold">
            <Icon name="ti-mountain" size={16} style={{ color: 'var(--accent-ink)' }} />
            Escapes
          </span>
          <OccasionTiles cats={escapeCats} picks={picks} onToggle={onToggle} light />
        </div>
      )}
    </section>
  );
}
