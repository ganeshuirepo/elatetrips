/**
 * The rate card refuses to work for a partner that does not exist.
 * Run: `npm test` (Node's own runner; see scripts/register-ts.js).
 *
 * `partner_id` used to be a free string, checked by nothing. The bug that
 * allowed is quiet rather than loud: a typo in the id does not fail, it opens a
 * brand-new empty rate card that looks exactly like a real partner who has not
 * submitted yet. Rates then get filed against an id no booking will ever price
 * from — and, since the id is also what the page URL addresses, the mistake is
 * invisible from both ends.
 *
 * So the check covers READS as well as writes. A 404 on a mistyped id is the
 * only thing that tells anyone the id was wrong.
 */
import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { StaticPartnerDirectory } from '../../common/ports/partnerDirectory';
import { AppError } from '../../common/errors/AppError';
import { loadRatecardConfig } from './ratecard.config';
import { RatecardAuditStore } from './ratecard.audit';
import { InMemoryRateRowRepository } from './ratecard.repository';
import { ManualUploadSheetProvider } from './ratecard.sheets';
import { RateCardService } from './ratecard.service';
import type { RawSheetRow } from './ratecard.types';

const REAL = 'SUP-0001';
const NOT_REAL = 'SUP-9999';

let service: RateCardService;

beforeEach(() => {
  service = new RateCardService({
    repo: new InMemoryRateRowRepository(),
    partners: new StaticPartnerDirectory([REAL]),
    sheets: new ManualUploadSheetProvider(),
    audit: new RatecardAuditStore(),
    config: loadRatecardConfig({}),
  });
});

function rows(sku = 'DLX-BB-2P'): RawSheetRow[] {
  return [
    {
      destination: 'Goa',
      sku,
      price_minor: 750_000,
      currency: 'INR',
      effective_from: '2026-01-01',
      schema_version: 1,
      cell: { sheet: 'Rates', row: 2 },
    },
  ];
}

/** Run a call and hand back the error it threw, rather than letting it escape. */
async function caught(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    assert.ok(err instanceof AppError, `expected an AppError, got ${String(err)}`);
    return err;
  }
  throw new Error('expected the call to be refused, but it succeeded');
}

describe('a partner that does not exist', () => {
  it('cannot have rates ingested for it', async () => {
    const err = await caught(() => service.ingest(NOT_REAL, rows(), 'manual_upload'));
    assert.equal(err.statusCode, 404);
  });

  it('is refused before any row is even looked at', async () => {
    // The refusal is about the partner, so a payload of perfectly valid rows
    // changes nothing — and neither does a payload of garbage.
    const err = await caught(() => service.ingest(NOT_REAL, [], 'manual_upload'));
    assert.equal(err.statusCode, 404);
  });

  it('cannot be synced from a sheet', async () => {
    const err = await caught(() => service.ingestFromSheet(NOT_REAL));
    assert.equal(err.statusCode, 404);
  });

  it('has no freshness — rather than a plausible-looking "never submitted"', async () => {
    // This is the read that would otherwise lie most convincingly: a mistyped
    // id would score as a real partner who has simply gone stale.
    const err = await caught(() => service.getFreshness(NOT_REAL));
    assert.equal(err.statusCode, 404);
  });

  it('has no rows to list', async () => {
    const err = await caught(() => service.listRows(NOT_REAL, 'DLX-BB-2P'));
    assert.equal(err.statusCode, 404);
  });

  it('has no rate to snapshot', async () => {
    const err = await caught(() => service.snapshotRate(NOT_REAL, 'DLX-BB-2P', '2026-02-01'));
    assert.equal(err.statusCode, 404);
  });
});

describe('a partner that does exist', () => {
  it('ingests, and the rows land', async () => {
    const summary = await service.ingest(REAL, rows(), 'manual_upload');
    assert.equal(summary.applied.length, 1);
    assert.equal(summary.applied[0].partner_id, REAL);
  });

  it('answers freshness before it has ever submitted', async () => {
    // "Real partner, no rates yet" must stay a legitimate, non-error state —
    // the check must not turn a new partner into a 404.
    const result = await service.getFreshness(REAL);
    assert.equal(result.partner_id, REAL);
    assert.equal(result.score_days, null);
  });

  it('lists no rows for a SKU it has not priced', async () => {
    assert.deepEqual(await service.listRows(REAL, 'NOTHING-YET'), []);
  });

  it('still 404s for a SKU with no applied rate, not for the partner', async () => {
    const err = await caught(() => service.snapshotRate(REAL, 'NOTHING-YET', '2026-02-01'));
    assert.equal(err.statusCode, 404);
    assert.match(err.message, /No applied rate/);
  });
});

describe('the refusal message', () => {
  it('names the unknown partner, because the caller made a typo', async () => {
    // Safe to be specific here: this endpoint already requires an ops role or
    // the partner's own token, so it cannot be walked anonymously to enumerate
    // ids. partnerScopedGuard is what keeps one partner from probing another,
    // and it answers identically whether or not the id is real.
    const err = await caught(() => service.getFreshness(NOT_REAL));
    assert.match(err.message, /SUP-9999/);
  });
});
