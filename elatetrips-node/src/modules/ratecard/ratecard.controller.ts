/**
 * RateCardController — thin HTTP adapter over RateCardService. Reads the
 * already-validated request (see ratecard.validation + validate() middleware),
 * delegates to the service, and returns the uniform { success, data } envelope.
 * No business logic lives here (Single Responsibility).
 */
import type { Request, Response } from 'express';
import { ok, created } from '../../common/http/ApiResponse';
import type { RateCardService } from './ratecard.service';
import type { RawSheetRow } from './ratecard.types';

export class RateCardController {
  constructor(private readonly service: RateCardService) {}

  // Ingestion (manual upload adapter)
  ingest = async (req: Request, res: Response): Promise<Response> => {
    const rows = req.body.rows as RawSheetRow[];
    const summary = await this.service.ingest(req.params.partnerId, rows, 'manual_upload');
    return ok(res, summary);
  };

  // Ingestion (pull from the sheet provider stub — no rows until wired)
  sync = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.ingestFromSheet(req.params.partnerId));

  // Staged review queue
  listStaged = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.listStaged({
      partner_id: req.query.partner_id as string | undefined,
      sku: req.query.sku as string | undefined,
      status: req.query.status as 'pending' | 'approved' | 'rejected' | undefined,
    }));

  approveStaged = async (req: Request, res: Response): Promise<Response> =>
    created(res, await this.service.approveStaged(req.params.proposalId, req.body.actor_id));

  rejectStaged = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.rejectStaged(req.params.proposalId, req.body.actor_id, req.body.note));

  // Freshness (M19/M20 read this to suspend stale members)
  freshness = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.getFreshness(req.params.partnerId));

  // Booking-time snapshot / ledger inspection
  rate = async (req: Request, res: Response): Promise<Response> => {
    const sku = req.query.sku as string;
    const at = (req.query.at as string | undefined) ?? new Date().toISOString().slice(0, 10);
    return ok(res, await this.service.snapshotRate(req.params.partnerId, sku, at));
  };

  rows = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.listRows(req.params.partnerId, req.query.sku as string));
}
