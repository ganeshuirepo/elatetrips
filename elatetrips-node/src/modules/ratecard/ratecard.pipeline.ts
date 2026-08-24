/**
 * Ingestion pipeline — the pure validate → decide steps (FR17.1/FR17.3).
 * validateRow() is the gate that keeps invalid rows from ever landing; every
 * failure carries the offending cell reference so the partner can be told
 * exactly which cell to fix. decideIngestion() combines the (baseline-based)
 * tolerance band with the cumulative-drift guard into a single apply/stage call.
 *
 * No I/O, no config literals — the caller supplies resolved slabs + window.
 */
import type {
  Currency,
  IngestionDecision,
  RateRow,
  RawSheetRow,
  RowValidation,
  RowValidationError,
  ToleranceSlab,
} from './ratecard.types';
import {
  cumulativeDriftGuard,
  evaluateTolerance,
  stageDiff,
  type DriftHistoryPoint,
} from './ratecard.tolerance';

const CURRENCIES: readonly Currency[] = ['INR', 'USD', 'EUR', 'GBP', 'AED'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Validate one raw row. Returns the typed NormalizedRow on success, or the full
 * list of cell-referenced errors on failure. A row with ANY error never lands.
 */
export function validateRow(raw: RawSheetRow): RowValidation {
  const errors: RowValidationError[] = [];
  const fail = (field: string, message: string): void => {
    errors.push({ cell: raw.cell, field, message });
  };

  if (!isNonEmptyString(raw.partner_id)) fail('partner_id', 'partner_id is required');
  if (!isNonEmptyString(raw.destination)) fail('destination', 'destination is required');
  if (!isNonEmptyString(raw.sku)) fail('sku', 'sku is required');

  if (typeof raw.price_minor !== 'number' || !Number.isInteger(raw.price_minor)) {
    fail('price_minor', 'price_minor must be an integer (minor units)');
  } else if (raw.price_minor < 0) {
    fail('price_minor', 'price_minor must not be negative');
  }

  if (!isNonEmptyString(raw.currency) || !CURRENCIES.includes(raw.currency as Currency)) {
    fail('currency', `currency must be one of ${CURRENCIES.join(', ')}`);
  }

  if (!isNonEmptyString(raw.effective_from) || !ISO_DATE.test(raw.effective_from)) {
    fail('effective_from', 'effective_from must be an ISO date (YYYY-MM-DD)');
  }
  if (raw.effective_to !== undefined && raw.effective_to !== null) {
    if (!isNonEmptyString(raw.effective_to) || !ISO_DATE.test(raw.effective_to)) {
      fail('effective_to', 'effective_to must be an ISO date (YYYY-MM-DD)');
    } else if (
      isNonEmptyString(raw.effective_from) &&
      ISO_DATE.test(raw.effective_from) &&
      raw.effective_to < raw.effective_from
    ) {
      fail('effective_to', 'effective_to must not precede effective_from');
    }
  }

  if (typeof raw.schema_version !== 'number' || !Number.isInteger(raw.schema_version)) {
    fail('schema_version', 'schema_version must be an integer');
  }

  if (errors.length > 0) return { valid: false, errors };

  const row = {
    partner_id: raw.partner_id as string,
    destination: raw.destination as string,
    sku: raw.sku as string,
    price: { amount: raw.price_minor as number, currency: raw.currency as Currency },
    effective_from: raw.effective_from as string,
    schema_version: raw.schema_version as number,
    cell: raw.cell,
    ...(isNonEmptyString(raw.effective_to) ? { effective_to: raw.effective_to } : {}),
  };
  return { valid: true, row };
}

export interface DecideInput {
  baseline: RateRow | undefined;
  incomingMinor: number;
  driftHistory: DriftHistoryPoint[];
  driftWindowStart: Date | null;
  slabs: ToleranceSlab[];
  defaultPct?: number;
  meta: { partner_id: string; destination: string; sku: string };
}

/**
 * Combine the single-step tolerance decision with the cumulative-drift guard.
 * A row auto-applies only when it is within the baseline band AND does not
 * breach the rolling-window drift band; otherwise it stages, with the reason
 * recording which rule caught it (a within-band step blocked by drift is the
 * salami-slicing case).
 */
export function decideIngestion(input: DecideInput): IngestionDecision {
  const baselineMinor = input.baseline ? input.baseline.price.amount : null;
  const diff = stageDiff(input.baseline, input.incomingMinor, input.meta);
  const tolerance = evaluateTolerance(baselineMinor, input.incomingMinor, input.slabs, input.defaultPct);
  const drift = cumulativeDriftGuard(
    input.driftHistory,
    input.incomingMinor,
    input.driftWindowStart,
    input.slabs,
    input.defaultPct,
  );

  if (tolerance.decision === 'stage') {
    return { action: 'stage', diff, tolerance, drift, reason: tolerance.reason ?? 'beyond_band' };
  }
  if (drift.breached) {
    return { action: 'stage', diff, tolerance, drift, reason: 'cumulative_drift' };
  }
  return { action: 'apply', diff, tolerance, drift };
}
