'use client';

import { useAppSelector } from '@/store/hooks';
import TransportPicker from '@/components/planner/plan/TransportPicker';
import TripTypePicker from '@/components/planner/cab/TripTypePicker';
import VehiclePicker from '@/components/planner/cab/VehiclePicker';
import PickupSearch from '@/components/planner/cab/PickupSearch';
import FareEstimate from '@/components/planner/cab/FareEstimate';
import Icon from '@/components/ui/Icon';

/**
 * Transport question (own vs cab) and the cab details when a cab is chosen —
 * moved from the Plan step so getting around is decided alongside the stay.
 */
export default function TransportSection() {
  const { tMode, tTrip } = useAppSelector((s) => s.transport);

  return (
    <div className="flex flex-col gap-5">
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
        <p className="flex items-center gap-2 text-[13px] text-white/65">
          <Icon name="circle-check" size={16} /> No cab needed — pick your stay below.
        </p>
      )}
    </div>
  );
}
