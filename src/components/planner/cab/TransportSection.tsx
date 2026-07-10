'use client';

import { useAppSelector } from '@/store/hooks';
import TripTypePicker from '@/components/planner/cab/TripTypePicker';
import VehiclePicker from '@/components/planner/cab/VehiclePicker';
import PickupSearch from '@/components/planner/cab/PickupSearch';
import FareEstimate from '@/components/planner/cab/FareEstimate';

/**
 * Cab configuration — trip type, vehicle, pickup (for complete trips) and the
 * live fare estimate. Being on the Cabs tab already means a cab is wanted, so
 * there is no own-vs-cab question; it starts straight at the trip type.
 */
export default function TransportSection() {
  const tTrip = useAppSelector((s) => s.transport.tTrip);

  return (
    <div className="flex flex-col gap-5">
      <TripTypePicker />
      <VehiclePicker />
      {tTrip === 'endtoend' && <PickupSearch />}
      <FareEstimate />
    </div>
  );
}
