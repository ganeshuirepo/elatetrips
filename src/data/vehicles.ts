import type { Vehicle } from '@/domain/types';

/**
 * Cab options. `rate` is ₹ per km (complete-trip pickups); `localRate` is the
 * ₹ per-day package for local sightseeing (8 hrs / 80 km); `max` is the seat cap
 * used for pax filtering.
 */
export const VEHICLES: Vehicle[] = [
  { id: 'hatchback', name: 'Hatchback', sub: 'Up to 4 seats', max: 4, rate: 12, localRate: 2200 },
  { id: 'sedan', name: 'Sedan', sub: 'Up to 4 seats', max: 4, rate: 14, localRate: 2600 },
  { id: 'suv', name: 'SUV', sub: 'Up to 6 seats', max: 6, rate: 18, localRate: 3400 },
  { id: 'tempo', name: 'Tempo Traveller', sub: 'Up to 12 seats', max: 12, rate: 24, localRate: 4800 },
  { id: 'minibus', name: 'Mini Bus', sub: 'Up to 20 seats', max: 20, rate: 32, localRate: 6500 },
  { id: 'bus', name: 'Bus', sub: 'Up to 40 seats', max: 40, rate: 46, localRate: 9000 },
];
