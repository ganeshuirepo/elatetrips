'use client';

import { useAppSelector } from '@/store/hooks';
import { selectPickupEstimate, selectLocalEstimate } from '@/store/selectors/transportSelectors';
import { inr } from '@/domain/format';
import Icon from '@/components/ui/Icon';

const cardClass =
  'border-line flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[14px] border p-4';
const cardStyle = { background: 'color-mix(in srgb, var(--primary) 5%, #fff)' } as const;

/** Estimated cab fare — per-day package for local trips, round-trip for complete trips. */
export default function FareEstimate() {
  const tTrip = useAppSelector((s) => s.transport.tTrip);
  const local = useAppSelector(selectLocalEstimate);
  const est = useAppSelector(selectPickupEstimate);

  if (tTrip === 'local') {
    return (
      <div className={cardClass} style={cardStyle}>
        <div className="flex items-center gap-2">
          <Icon name="clock" size={20} style={{ color: 'var(--primary)' }} />
          <div className="flex flex-col">
            <span className="text-ink text-[15px] font-extrabold">
              {inr(local.perDay)}/day
            </span>
            <span className="text-muted text-[12px]">
              {local.hoursPerDay} hrs / {local.kmPerDay} km per day
              {local.vehName ? ` · ${local.vehName}` : ''}
            </span>
          </div>
        </div>
        {local.hasVehicle ? (
          <div className="flex flex-col">
            <span className="text-accent-ink text-[15px] font-extrabold">
              ≈ {inr(local.total)}
            </span>
            <span className="text-muted text-[12px]">
              {inr(local.perDay)} × {local.days} {local.days === 1 ? 'day' : 'days'}
            </span>
          </div>
        ) : (
          <span className="text-muted text-[12.5px]">Pick a vehicle to estimate the fare.</span>
        )}
      </div>
    );
  }

  if (!est) return null;

  return (
    <div className={cardClass} style={cardStyle}>
      <div className="flex items-center gap-2">
        <Icon name="route" size={20} style={{ color: 'var(--primary)' }} />
        <div className="flex flex-col">
          <span className="text-ink text-[15px] font-extrabold">
            ≈ {est.roundTripKm.toLocaleString('en-IN')} km
          </span>
          <span className="text-muted text-[12px]">
            {est.oneWayKm.toLocaleString('en-IN')} km each way → {est.destName}
          </span>
        </div>
      </div>
      {est.hasVehicle ? (
        <div className="flex flex-col">
          <span className="text-accent-ink text-[15px] font-extrabold">≈ {inr(est.fare!)}</span>
          <span className="text-muted text-[12px]">
            {inr(est.rate!)}/km · {est.vehName}
          </span>
        </div>
      ) : (
        <span className="text-muted text-[12.5px]">Pick a vehicle to estimate the fare.</span>
      )}
    </div>
  );
}
