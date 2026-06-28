'use client';

import { useAppSelector } from '@/store/hooks';
import { selectCostSummary } from '@/store/selectors/addonsSelectors';
import { inr } from '@/domain/format';

/** Running add-ons cost breakdown. Hotel & cab fares are quoted separately. */
export default function CostSummary() {
  const { packages, adventures, experiences, addonsTotal } = useAppSelector(selectCostSummary);

  const row = (label: string, value: number) => (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="text-ink font-bold">{inr(value)}</span>
    </div>
  );

  return (
    <div className="border-line flex flex-col gap-2 rounded-[14px] border bg-white p-4">
      <span className="text-ink text-[13px] font-extrabold">Cost summary</span>
      {row('Celebration packages', packages)}
      {row('Adventures', adventures)}
      {row('Local experiences', experiences)}
      <div className="border-line mt-1 flex items-center justify-between border-t pt-2">
        <span className="text-ink text-[13px] font-extrabold">Add-ons total</span>
        <span className="text-accent-ink text-[16px] font-extrabold">{inr(addonsTotal)}</span>
      </div>
      <span className="text-muted text-[11.5px]">
        Hotel and cab fares are confirmed separately by our partners.
      </span>
    </div>
  );
}
