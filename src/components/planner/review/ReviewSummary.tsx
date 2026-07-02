'use client';

import { useAppSelector } from '@/store/hooks';
import { selectReviewSummary } from '@/store/selectors/reviewSelectors';
import { selectCostSummary } from '@/store/selectors/addonsSelectors';
import { selectCartLines, selectCartSubtotal } from '@/store/selectors/unifiedCartSelectors';
import { selectDiscount, selectPayable } from '@/store/selectors/paymentSelectors';
import { inr } from '@/domain/format';
import Icon from '@/components/ui/Icon';

/**
 * Single summary card for the shared review page: trip details when a trip is
 * planned, plus every cart line (gifts, services, stay) and the grand total.
 * Also serves the shop-only flow, where no trip rows exist.
 */
export default function ReviewSummary() {
  const s = useAppSelector(selectReviewSummary);
  const cost = useAppSelector(selectCostSummary);
  const cartLines = useAppSelector(selectCartLines);
  const cartSubtotal = useAppSelector(selectCartSubtotal);
  const coupon = useAppSelector((st) => st.review.coupon);
  const discount = useAppSelector(selectDiscount);
  const payable = useAppSelector(selectPayable);

  const hasTrip = s.destination !== '—' || s.dates !== '—' || s.hotelLabel !== 'Not selected';

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
      <h3 className="text-primary m-0 mb-2 font-serif text-xl font-bold">
        {hasTrip ? 'Your celebration plan' : 'Your order'}
      </h3>

      {hasTrip && (
        <>
          {row('map-pin', 'Destination', s.destination)}
          {row('calendar-event', 'Tour dates', s.dates)}
          {row('users', 'Travellers', s.travellers)}
          {row('car', 'Transport', s.transportLabel)}
          {row('building', 'Hotel', s.hotelLabel)}
        </>
      )}

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

      {cartLines.length > 0 && (
        <div className="border-line flex items-start gap-3 border-b py-2">
          <Icon name="shopping-cart" size={17} style={{ color: 'var(--primary)', marginTop: 2 }} />
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-muted text-[11px] font-black tracking-[0.05em] uppercase">
              Cart items
            </span>
            {cartLines.map((line) => (
              <div key={line.key} className="flex items-baseline justify-between gap-3">
                <span className="text-ink text-[13px]">
                  <span className="font-bold">{line.label}</span>
                  <span className="text-muted"> · {line.detail}</span>
                </span>
                <span className="text-ink text-[13px] font-bold whitespace-nowrap">
                  {inr(line.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-col gap-1">
        {cost.addonsTotal > 0 && (
          <div className="flex items-center justify-between px-3">
            <span className="text-muted text-[12px] font-bold">Add-ons</span>
            <span className="text-ink text-[13px] font-bold">{inr(cost.addonsTotal)}</span>
          </div>
        )}
        {cartSubtotal > 0 && (
          <div className="flex items-center justify-between px-3">
            <span className="text-muted text-[12px] font-bold">Cart items</span>
            <span className="text-ink text-[13px] font-bold">{inr(cartSubtotal)}</span>
          </div>
        )}
        {discount > 0 && (
          <div className="flex items-center justify-between px-3">
            <span className="text-[12px] font-bold text-[#1E7A3A]">Coupon ({coupon})</span>
            <span className="text-[13px] font-bold text-[#1E7A3A]">−{inr(discount)}</span>
          </div>
        )}
        <div className="bg-sand/60 flex items-center justify-between rounded-[12px] px-3 py-2">
          <span className="text-ink text-[13px] font-extrabold">Total payable</span>
          <span className="text-accent-ink text-[17px] font-extrabold">{inr(payable)}</span>
        </div>
      </div>
    </div>
  );
}
