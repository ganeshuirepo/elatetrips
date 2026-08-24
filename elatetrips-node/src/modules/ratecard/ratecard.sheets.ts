/**
 * Sheet source behind an interface (FR17.1). The production source is a
 * platform-owned Google Sheet per partner with an Apps Script onEdit trigger +
 * nightly reconcile — but that needs Google credentials and is CONFIG LATER.
 *
 * Only a stub ships now: ManualUploadSheetProvider, which carries no Google
 * integration. Rows arrive by direct API upload (see the ingest endpoint) rather
 * than being pulled from a sheet, so fetchRows() returns nothing, and invalid-row
 * notification is logged rather than emailed. Swapping in the real
 * GoogleSheetsProvider is a one-line container change (Dependency Inversion).
 */
import type { RawSheetRow, RowValidationError } from './ratecard.types';

export interface ISheetProvider {
  /** Pull the current rows for a partner's owned sheet (onEdit / nightly batch). */
  fetchRows(partner_id: string): Promise<RawSheetRow[]>;
  /**
   * Notify a partner of rows that failed validation, with the exact cell
   * references, so they can fix the source (FR17.1 — invalid rows never land).
   */
  notifyInvalid(partner_id: string, errors: RowValidationError[]): Promise<void>;
}

/**
 * Manual-upload stub. No Google creds, no network. Rows come in through the
 * ingest API instead of being fetched, so fetchRows is empty; notifications are
 * logged for now. This is the only provider that ships (task constraint).
 */
export class ManualUploadSheetProvider implements ISheetProvider {
  async fetchRows(_partner_id: string): Promise<RawSheetRow[]> {
    // Manual upload posts rows directly to the ingest endpoint; there is no
    // sheet to pull from in this adapter.
    return [];
  }

  async notifyInvalid(partner_id: string, errors: RowValidationError[]): Promise<void> {
    // Real delivery (email/in-app to the partner) is config later. Logging keeps
    // the cell references visible without a side channel.
    if (errors.length === 0) return;
    const refs = errors.map((e) => `${e.cell.sheet}!R${e.cell.row} ${e.field}: ${e.message}`);
    // eslint-disable-next-line no-console
    console.warn(`[ratecard] invalid rows for partner ${partner_id}:\n  ${refs.join('\n  ')}`);
  }
}
