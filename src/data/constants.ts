/** Trip-level numeric bounds shared across the planner. */

/** Hard caps on traveller steppers and day/headcount loops. */
export const TRAVELLERS_MAX = 40;
export const ROOMS_MAX = 20;
export const TRIP_DAYS_MAX = 60;

/**
 * Cap on total selected occasions. Set above the largest valid combination
 * (Birthday + Anniversary + all 3 escapes = 5) so escapes are never blocked by
 * the count — structural validity is enforced by `celebComboValid`.
 */
export const MAX_CELEBRATIONS_DEFAULT = 6;
