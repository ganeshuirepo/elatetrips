'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import { selectTransportFullReady } from '@/store/selectors/planSelectors';
import { selectCabHelp } from '@/store/selectors/transportSelectors';
import TripTypePicker from './TripTypePicker';
import VehiclePicker from './VehiclePicker';
import PickupSearch from './PickupSearch';
import FareEstimate from './FareEstimate';
import Icon from '@/components/ui/Icon';

/** Step 2 — cab details: vehicle, pickup (complete trip), and fare estimate. */
export default function CabStep() {
  const dispatch = useAppDispatch();
  const { tTrip } = useAppSelector((s) => s.transport);
  const ready = useAppSelector(selectTransportFullReady);
  const help = useAppSelector(selectCabHelp);

  return (
    <div className="flex flex-col gap-6">
      <TripTypePicker />
      <VehiclePicker />
      {tTrip === 'endtoend' && <PickupSearch />}
      <FareEstimate />

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
