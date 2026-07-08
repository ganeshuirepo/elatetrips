'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addCabToTrip, removeCabFromTrip } from '@/store/slices/transportSlice';
import { selectTransportFullReady, selectPage1Ready } from '@/store/selectors/planSelectors';
import {
  selectPickupEstimate,
  selectLocalEstimate,
  selectCabHelp,
} from '@/store/selectors/transportSelectors';
import TransportSection from './TransportSection';
import { GOLD_BUTTON } from '@/components/planner/goldButton';
import { inr } from '@/domain/format';
import Icon from '@/components/ui/Icon';

/**
 * Cabs tab — pick how you'll get around and, for a cab, add it to the trip
 * as a payable cart line. The amount shown here is the same estimate the
 * cart line uses, so they always agree.
 */
export default function CabTab() {
  const dispatch = useAppDispatch();
  const { tMode, tTrip, cabAdded } = useAppSelector((s) => s.transport);
  const transportReady = useAppSelector(selectTransportFullReady);
  const datesReady = useAppSelector(selectPage1Ready);
  const cabHelp = useAppSelector(selectCabHelp);
  const pickup = useAppSelector(selectPickupEstimate);
  const local = useAppSelector(selectLocalEstimate);

  const fare = tTrip === 'local' ? local.total : (pickup?.fare ?? 0);
  const cabConfigured = tMode === 'cab' && transportReady;
  const canAdd = cabConfigured && datesReady && fare > 0;

  const hint = !cabConfigured
    ? cabHelp
    : !datesReady
      ? 'Pick your destination & dates above — the fare depends on them.'
      : fare <= 0
        ? 'We could not price this cab — check the pickup location.'
        : 'Fare estimate includes the round trip. Add it to your order.';

  return (
    <div className="flex flex-col gap-5">
      <TransportSection />

      {/* Add-to-trip bar — only meaningful once a cab is being configured */}
      {tMode === 'cab' && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-white/12 bg-white/[0.04] px-4 py-3"
          data-testid="cab-add-bar"
        >
          <span className="flex items-center gap-2 text-[13px] text-white/70">
            <Icon name="info-circle" size={16} /> {hint}
          </span>
          {cabAdded ? (
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: '#7BC89B' }}>
                <Icon name="circle-check" size={17} /> Cab added to your trip
              </span>
              <Button
                variant="outlined"
                size="small"
                onClick={() => dispatch(removeCabFromTrip())}
                sx={{ color: 'rgba(255,255,255,.8)', borderColor: 'rgba(255,255,255,.35)' }}
              >
                Remove
              </Button>
            </span>
          ) : (
            <Button
              variant="contained"
              size="large"
              disabled={!canAdd}
              onClick={() => dispatch(addCabToTrip())}
              startIcon={<Icon name="shopping-cart-plus" size={18} />}
              sx={GOLD_BUTTON}
            >
              Add cab to trip{canAdd ? ` · ≈${inr(fare)}` : ''}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
