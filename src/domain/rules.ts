/** Pure business rules. Framework-free and exhaustively unit-tested. */

import { CELEB_EXCLUSIVE, CELEB_SOLO, ESCAPE_IDS } from '@/data/celebrations';
import { VEHICLES } from '@/data/vehicles';
import { PKGS, PKG_AGE } from '@/data/packages';
import type { AgeRange } from '@/domain/types';

/**
 * Whether a set of occasion ids may be booked together.
 * - 1 or fewer → always valid.
 * - An exclusive occasion (Wedding) cannot be combined with anything.
 * - Escapes are unrestricted (any number, with each other and any celebration).
 * - A "solo" celebration (Honeymoon, Bachelor, Proposal, Group) must be the only
 *   celebration chosen, though escapes may still be added.
 * - Otherwise the remaining celebrations (Birthday, Anniversary) combine freely.
 */
export function celebComboValid(ids: string[]): boolean {
  if (ids.length <= 1) return true;
  if (ids.some((i) => CELEB_EXCLUSIVE.includes(i))) return false;
  const celebs = ids.filter((i) => !ESCAPE_IDS.includes(i));
  if (celebs.some((i) => CELEB_SOLO.includes(i))) return celebs.length === 1;
  return true;
}

/**
 * Vehicle ids valid for a given traveller count. Cars (≤6 seats) and coaches
 * (>6 seats) never mix: ≤6 pax → only ≤6-seat vehicles; >6 pax → only >6-seat.
 */
export function validVehicleIds(pax: number): string[] {
  return VEHICLES.filter((v) => pax <= v.max && (pax > 6 ? v.max > 6 : v.max <= 6)).map(
    (v) => v.id,
  );
}

/** Whether a package suits the entered age. Unlisted packages suit any age. */
export function pkgFitsAge(name: string, age: number): boolean {
  const r: AgeRange | undefined = PKG_AGE[name];
  if (!r) return true;
  return age >= r[0] && age <= r[1];
}

/**
 * Packages offered for a single celebration, filtered by the per-celebration
 * age (Birthday/Milestone) and de-duplicated against names already shown under
 * earlier celebrations — a shared package appears only once across the flow.
 *
 * @param celebId         the celebration whose packages we want
 * @param ageById         map of celebrationId → entered age string
 * @param alreadyShown    package names already rendered under earlier celebrations
 */
export function packagesForCeleb(
  celebId: string,
  ageById: Record<string, string>,
  alreadyShown: ReadonlySet<string>,
): string[] {
  const ageBound = celebId === 'birthday';
  const age = ageBound ? Number(ageById[celebId] || '') : NaN;
  return (PKGS[celebId] || []).filter((name) => {
    if (alreadyShown.has(name)) return false;
    if (ageBound && ageById[celebId] && !pkgFitsAge(name, age)) return false;
    return true;
  });
}
