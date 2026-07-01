'use client';

import Button from '@mui/material/Button';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setStep } from '@/store/slices/uiSlice';
import { selectPlanStepReady, selectPlanHelp } from '@/store/selectors/planSelectors';
import DestinationSearch from './DestinationSearch';
import DatesField from './DatesField';
import TravellersRooms from './TravellersRooms';
import TransportPicker from './TransportPicker';
import TripTypePicker from '@/components/planner/cab/TripTypePicker';
import VehiclePicker from '@/components/planner/cab/VehiclePicker';
import PickupSearch from '@/components/planner/cab/PickupSearch';
import FareEstimate from '@/components/planner/cab/FareEstimate';
import Icon from '@/components/ui/Icon';

/**
 * Step 1 — the full planning screen: where, when & who, then the transport
 * question (own vs cab) and cab details when a cab is chosen.
 */
export default function PlanStep() {
  const dispatch = useAppDispatch();
  const stepReady = useAppSelector(selectPlanStepReady);
  const help = useAppSelector(selectPlanHelp);
  const { tMode, tTrip } = useAppSelector((s) => s.transport);

  return (
    // No card surface — the white widgets float directly on the dark canvas.
    <div className="flex flex-col gap-5">
      {/* Where & when — destination and tour dates share one row */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
            Where &amp; when
          </span>
          <span className="text-[12.5px] text-white/55">Ooty is live — more soon</span>
        </div>
        <div className="flex flex-wrap items-stretch gap-3">
          <div className="min-w-[240px] flex-[2_1_260px]">
            <DestinationSearch />
          </div>
          <div className="min-w-[240px] flex-[2_1_260px]">
            <DatesField />
          </div>
        </div>
      </div>

      {/* Travellers & rooms (left) + Transport (right) share a row */}
      <div className="flex flex-wrap gap-x-8 gap-y-5">
        <div className="flex min-w-[280px] flex-1 flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-accent text-[11px] font-black tracking-[0.06em] uppercase">
              Travellers &amp; rooms
            </span>
            <span className="text-[12.5px] text-white/55">Who&apos;s coming and how many rooms</span>
          </div>
          <TravellersRooms />
        </div>
        <div className="flex min-w-[280px] flex-1 flex-col">
          <TransportPicker />
        </div>
      </div>

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
        <p className="flex items-center gap-2 text-[13px] text-white/65">
          <Icon name="circle-check" size={16} /> No cab needed — we&apos;ll skip transport and head
          straight to hotels.
        </p>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4">
        <span className="flex items-center gap-2 text-[13px] text-white/65">
          <Icon name="info-circle" size={16} /> {help}
        </span>
        <div className="flex gap-2">
          <Button
            variant="contained"
            size="large"
            disabled={!stepReady}
            onClick={() => dispatch(setStep('celebration'))}
            endIcon={<Icon name="arrow-right" size={18} />}
            sx={{
              background: 'linear-gradient(180deg,#e9c97f,#d4a94f)',
              color: '#08201f',
              fontWeight: 800,
              boxShadow: 'none',
              '&:hover': { background: 'linear-gradient(180deg,#edd089,#d9af55)', boxShadow: 'none' },
              '&.Mui-disabled': { background: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.4)' },
            }}
          >
            Continue to celebration
          </Button>
        </div>
      </div>
    </div>
  );
}
