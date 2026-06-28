'use client';

import { useAppSelector } from '@/store/hooks';
import { selectReviewSummary } from '@/store/selectors/reviewSelectors';
import { selectCostSummary } from '@/store/selectors/addonsSelectors';
import { inr } from '@/domain/format';
import Icon from '@/components/ui/Icon';

/** Single summary card listing the whole celebration plan. */
export default function ReviewSummary() {
  const s = useAppSelector(selectReviewSummary);
  const cost = useAppSelector(selectCostSummary);

  const row = (icon: string, label: string, value: string) => (
    <div className="border-line flex items-start gap-3 border-b py-2 last:border-b-0">
      <Icon name={icon} size={17} style={{ color: 'var(--primary)', marginTop: 2 }} />
      <div className="flex flex-1 flex-col">
        <span className="text-muted text-[11px] font-black tracking-[0.05em] uppercase">
          {label}
        </span>
        <span className="text-ink text-[13.5px] font-semibold">{value}</span>
      </div>
    </div>
  );

  return (
    <div className="border-line flex flex-col gap-1 rounded-[16px] border bg-white p-4">
      <h3 className="text-primary m-0 mb-2 font-serif text-xl font-bold">Your celebration plan</h3>
      {row('map-pin', 'Destination', s.destination)}
      {row('calendar-event', 'Tour dates', s.dates)}
      {row('users', 'Travellers', s.travellers)}
      {row('car', 'Transport', s.transportLabel)}
      {row('building', 'Hotel', s.hotelLabel)}

      {s.packages.length > 0 && (
        <div className="border-line flex items-start gap-3 border-b py-2">
          <Icon name="gift" size={17} style={{ color: 'var(--primary)', marginTop: 2 }} />
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-muted text-[11px] font-black tracking-[0.05em] uppercase">
              Packages
            </span>
            {s.packages.map((p) => (
              <span key={p.celeb} className="text-ink text-[13px]">
                <span className="font-bold">{p.celeb}:</span> {p.names.join(', ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {s.adventures.length > 0 && row('mountain', 'Adventures', s.adventures.join(', '))}
      {s.experiences.length > 0 && row('masks-theater', 'Experiences', s.experiences.join(', '))}

      <div className="bg-sand/60 mt-2 flex items-center justify-between rounded-[12px] px-3 py-2">
        <span className="text-ink text-[13px] font-extrabold">Add-ons total</span>
        <span className="text-accent-ink text-[17px] font-extrabold">{inr(cost.addonsTotal)}</span>
      </div>
    </div>
  );
}
