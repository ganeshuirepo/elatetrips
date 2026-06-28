/** Pure pricing & geo math. Framework-free and unit-tested. */

import { VEHICLES } from '@/data/vehicles';
import { DESTINATIONS } from '@/data/destinations';
import { PKG_PRICE } from '@/data/packages';
import { ALL_PRODUCTS } from '@/data/shop';
import type { Cart, Voucher, VoucherMeta } from '@/domain/types';

/** Great-circle distance in km between two lat/lon points. */
export function haversineKm(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLa = toRad(la2 - la1);
  const dLo = toRad(lo2 - lo1);
  const a =
    Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

export interface PickupEstimateInput {
  pickupLat: number | null;
  pickupLon: number | null;
  destId: string | undefined;
  vehicleId: string;
}

/** Rough road distance + estimated round-trip cab fare for pickup → destination. */
export function pickupEstimate(input: PickupEstimateInput): PickupEstimate | null {
  const { pickupLat, pickupLon, destId, vehicleId } = input;
  if (pickupLat == null || pickupLon == null || !destId) return null;
  const d = DESTINATIONS.find((x) => x.id === destId);
  if (!d || d.lat == null) return null;
  const straight = haversineKm(pickupLat, pickupLon, d.lat, d.lon);
  if (straight < 1) return null;
  const oneWayKm = Math.round((straight * 1.3) / 5) * 5; // ~30% road detour, rounded to 5 km
  const roundTripKm = oneWayKm * 2;
  const veh = VEHICLES.find((v) => v.id === vehicleId);
  const rate = veh ? veh.rate : null;
  const fare = rate != null ? Math.round((roundTripKm * rate) / 100) * 100 : null;
  return {
    oneWayKm,
    roundTripKm,
    fare,
    rate,
    destName: d.name,
    vehName: veh ? veh.name : null,
    hasVehicle: !!veh,
  };
}

/** Hours and km included in one local sightseeing day-package. */
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

/** Local-sightseeing fare: per-day (8 hrs / 80 km) package × the days chosen. */
export function localTripEstimate(input: { vehicleId: string; days: number }): LocalEstimate {
  const veh = VEHICLES.find((v) => v.id === input.vehicleId);
  const days = Math.max(1, Math.floor(input.days) || 1);
  const perDay = veh ? veh.localRate : 0;
  return {
    perDay,
    days,
    total: perDay * days,
    hoursPerDay: LOCAL_HOURS_PER_DAY,
    kmPerDay: LOCAL_KM_PER_DAY,
    vehName: veh ? veh.name : null,
    hasVehicle: !!veh,
  };
}

/** Voucher line total: per-person price × headcount, headcount capped at pax. */
export function voucherLineTotal(price: number, qty: number, pax: number): number {
  return price * Math.min(qty, Math.max(1, pax));
}

/** Subtotal across selected vouchers in a list given their selection meta. */
export function vouchersSubtotal(
  list: Voucher[],
  meta: Record<string, VoucherMeta>,
  pax: number,
): number {
  return list.reduce((sum, v) => {
    const m = meta[v.id];
    return m ? sum + voucherLineTotal(v.price, m.qty, pax) : sum;
  }, 0);
}

/** Subtotal of all selected celebration packages across every celebration. */
export function packagesSubtotal(pkgsByCeleb: Record<string, string[]>): number {
  let sum = 0;
  for (const names of Object.values(pkgsByCeleb)) {
    for (const name of names) sum += PKG_PRICE[name] || 0;
  }
  return sum;
}

/** Total value of the shared shop cart. */
export function cartTotal(cart: Cart): number {
  return Object.entries(cart).reduce((sum, [id, qty]) => {
    const p = ALL_PRODUCTS.find((x) => x.id === id);
    return p ? sum + p.price * qty : sum;
  }, 0);
}

/** Number of items in the shared cart. */
export function cartCount(cart: Cart): number {
  return Object.values(cart).reduce((a, b) => a + b, 0);
}
