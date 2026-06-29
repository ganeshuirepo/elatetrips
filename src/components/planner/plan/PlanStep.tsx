'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import { selectPlanReady, selectPlanHelp } from '@/store/selectors/planSelectors';
import DestinationSearch from './DestinationSearch';
import WhenWho from './WhenWho';
import TransportPicker from './TransportPicker';
import TripTypePicker from '@/components/planner/cab/TripTypePicker';
import VehiclePicker from '@/components/planner/cab/VehiclePicker';
import PickupSearch from '@/components/planner/cab/PickupSearch';
import FareEstimate from '@/components/planner/cab/FareEstimate';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

/**
 * Step 2 — the full planning screen in one card: where, when & who, then the
 * transport question (own vs cab) and cab details when a cab is chosen.
 */
export default function PlanStep() {
  const dispatch = useAppDispatch();
  const planReady = useAppSelector(selectPlanReady);
  const help = useAppSelector(selectPlanHelp);
  const { tMode, tTrip } = useAppSelector((s) => s.transport);

  return (
    <Card className="flex flex-col gap-5">
      {/* Where to */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-accent-ink text-[11px] font-black tracking-[0.06em] uppercase">
            Where to?
          </span>
          <span className="text-muted text-[12.5px]">Ooty is live — more soon</span>
        </div>
        <DestinationSearch />
      </div>

      {/* When & who */}
      <WhenWho />

      {/* Transport — comes right after when & who */}
      <TransportPicker />

      {/* Cab details appear only when a cab is chosen */}
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

      {/* Action bar */}
      <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <span className="text-muted flex items-center gap-2 text-[13px]">
          <Icon name="info-circle" size={16} /> {help}
        </span>
        <div className="flex gap-2">
          <Button variant="text" color="primary" onClick={() => dispatch(setStep('celebration'))}>
            Back
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="large"
            disabled={!planReady}
            onClick={() => dispatch(setStep('stay'))}
            endIcon={<Icon name="arrow-right" size={18} />}
          >
            Continue to hotels
          </Button>
        </div>
      </div>
    </Card>
  );
}
