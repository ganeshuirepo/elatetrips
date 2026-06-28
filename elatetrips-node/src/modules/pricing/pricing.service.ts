import type { IReadRepository } from '../../common/interfaces/IReadRepository';
import type { Vehicle, Destination } from '../catalog/catalog.types';

export const LOCAL_HOURS_PER_DAY = 8;
export const LOCAL_KM_PER_DAY = 80;

export interface LocalEstimate {
  perDay: number;
  days: number;
  total: number;
  hoursPerDay: number;
  kmPerDay: number;
  vehName: string | null;
  hasVehicle: boolean;
}

export interface PickupEstimate {
  oneWayKm: number;
  roundTripKm: number;
  fare: number | null;
  rate: number | null;
  destName: string;
  vehName: string | null;
  hasVehicle: boolean;
}

/** Great-circle distance in km (Haversine). */
export function haversineKm(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLa = toRad(la2 - la1);
  const dLo = toRad(lo2 - lo1);
  const a =
    Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Cab pricing use cases — the same math as the frontend `domain/pricing`, but
 * sourcing vehicle rates and destination coordinates through repositories so
 * the numbers stay in one authoritative place (the database).
 */
export class PricingService {
  constructor(
    private readonly vehicles: IReadRepository<Vehicle>,
    private readonly destinations: IReadRepository<Destination>,
  ) {}

  async localEstimate(vehicleId: string, days: number): Promise<LocalEstimate> {
    const veh = await this.vehicles.findById(vehicleId);
    const d = Math.max(1, Math.floor(days) || 1);
    const perDay = veh ? veh.localRate : 0;
    return {
      perDay,
      days: d,
      total: perDay * d,
      hoursPerDay: LOCAL_HOURS_PER_DAY,
      kmPerDay: LOCAL_KM_PER_DAY,
      vehName: veh ? veh.name : null,
      hasVehicle: !!veh,
    };
  }

  async pickupEstimate(input: {
    pickupLat: number;
    pickupLon: number;
    destId: string;
    vehicleId?: string;
  }): Promise<PickupEstimate | null> {
    const dest = await this.destinations.findById(input.destId);
    if (!dest || dest.lat == null) return null;

    const straight = haversineKm(input.pickupLat, input.pickupLon, dest.lat, dest.lon);
    if (straight < 1) return null;

    const oneWayKm = Math.round((straight * 1.3) / 5) * 5; // ~30% road detour
    const roundTripKm = oneWayKm * 2;
    const veh = input.vehicleId ? await this.vehicles.findById(input.vehicleId) : null;
    const rate = veh ? veh.rate : null;
    const fare = rate != null ? Math.round((roundTripKm * rate) / 100) * 100 : null;

    return {
      oneWayKm,
      roundTripKm,
      fare,
      rate,
      destName: dest.name,
      vehName: veh ? veh.name : null,
      hasVehicle: !!veh,
    };
  }
}
