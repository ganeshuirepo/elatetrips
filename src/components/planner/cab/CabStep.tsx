'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import { selectTransportFullReady } from '@/store/selectors/planSelectors';
import { selectCabHelp } from '@/store/selectors/transportSelectors';
import TransportPicker from '@/components/planner/plan/TransportPicker';
import TripTypePicker from './TripTypePicker';
import VehiclePicker from './VehiclePicker';
import PickupSearch from './PickupSearch';
import FareEstimate from './FareEstimate';
import Icon from '@/components/ui/Icon';

/** Step 2 — transport: own vs cab first, then cab details when a cab is chosen. */
export default function CabStep() {
  const dispatch = useAppDispatch();
  const { tMode, tTrip } = useAppSelector((s) => s.transport);
  const ready = useAppSelector(selectTransportFullReady);
  const help = useAppSelector(selectCabHelp);

  return (
    <div className="flex flex-col gap-6">
      {/* Transport choice always comes first. */}
      <TransportPicker />

      {tMode === 'cab' && (
        <>
          <TripTypePicker />
          <VehiclePicker />
          {tTrip === 'endtoend' && <PickupSearch />}
          <FareEstimate />
        </>
      )}

      {tMode === 'own' && (
        <p className="text-muted flex items-center gap-2 text-[13px]">
          <Icon name="circle-check" size={16} /> No cab needed — we&apos;ll skip transport and head
          straight to hotels.
        </p>
      )}

      <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <span className="text-muted flex items-center gap-2 text-[13px]">
          <Icon name="info-circle" size={16} /> {help}
        </span>
        <div className="flex gap-2">
          <Button variant="text" color="primary" onClick={() => dispatch(setStep('plan'))}>
            Back
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="large"
            disabled={!ready}
            onClick={() => dispatch(setStep('stay'))}
            endIcon={<Icon name="arrow-right" size={18} />}
          >
            Continue to hotels
          </Button>
        </div>
      </div>
    </div>
  );
}
