'use client';

import { ADVENTURES, EXPERIENCES } from '@/data/activities';
import VoucherCard from './VoucherCard';
import type { Voucher } from '@/domain/types';

export type ActivityKind = 'all' | 'adventure' | 'experience';

/** Adventures + local experiences as expandable rows, filtered by kind + category. */
export default function ActivitiesExperiences({
  kind = 'all',
  categoryFilter = [],
}: {
  kind?: ActivityKind;
  categoryFilter?: string[];
}) {
  const showAdventures = kind === 'all' || kind === 'adventure';
  const showExperiences = kind === 'all' || kind === 'experience';

  const inCategory = (v: Voucher) =>
    categoryFilter.length === 0 || categoryFilter.includes(v.category);

  const adventures = ADVENTURES.filter(inCategory);
  const experiences = EXPERIENCES.filter(inCategory);

  return (
    <div className="flex flex-col gap-4">
      {showAdventures && adventures.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-accent-ink text-[11px] font-black tracking-[0.06em] uppercase">
            Adventures
          </span>
          {adventures.map((v) => (
            <VoucherCard key={v.id} metaKey="advMeta" voucher={v} />
          ))}
        </div>
      )}
      {showExperiences && experiences.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-accent-ink text-[11px] font-black tracking-[0.06em] uppercase">
            Local experiences
          </span>
          {experiences.map((v) => (
            <VoucherCard key={v.id} metaKey="expMeta" voucher={v} />
          ))}
        </div>
      )}
      {((showAdventures && adventures.length === 0 && !showExperiences) ||
        (showExperiences && experiences.length === 0 && !showAdventures) ||
        (showAdventures && showExperiences && adventures.length === 0 && experiences.length === 0)) && (
        <p className="text-muted text-[13px]">No activities match the selected filters.</p>
      )}
    </div>
  );
}
