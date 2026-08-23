/**
 * Contracts controller — thin HTTP adapter over the ContractsEngine. Reads the
 * typed request, calls the engine (which validates → 422, emits audit events,
 * masks supplier views), and returns the uniform `{ success, data }` envelope.
 * No business logic lives here (Single Responsibility).
 */
import type { Request, Response } from 'express';
import { ok } from '../../common/http/ApiResponse';
import type { ContractsEngine } from './contracts.engine';

const q = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

export class ContractsController {
  constructor(private readonly engine: ContractsEngine) {}

  // Intake (M1)
  createRfq = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.createRfq(req.body));
  patchRfq = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.patchRfq(req.params.rfqId, req.body));
  submitRfq = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.submitRfq(req.params.rfqId));

  // Itinerary (M2)
  buildItinerary = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.buildItinerary(req.params.rfqId, req.body));
  patchItinerary = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.patchItinerary(req.params.itineraryId, req.body));

  // Directory (M3/M12)
  listSuppliers = async (req: Request, res: Response): Promise<Response> =>
    ok(res, this.engine.listSuppliers({ destination: q(req.query.destination), track: q(req.query.track) }));

  // Broadcast (M5)
  broadcast = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.broadcast(req.params.rfqId, req.body));

  // Partner surface (M6)
  getLink = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.getLink(req.params.token));
  linkQuote = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.linkQuote(req.params.token, req.body));
  linkEnrichment = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.linkEnrichment(req.params.token, req.body));
  linkReconfirm = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.linkReconfirm(req.params.token, req.body));

  // Quote intelligence (M7)
  listQuotes = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.listQuotes(req.params.rfqId));
  shortlist = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.shortlist(req.params.rfqId));
  negotiate = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.negotiate(req.params.quoteId, req.body));

  // Booking & fulfilment (M8/M9)
  checkout = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.checkout(req.params.quoteId));
  // Razorpay ack is 202 per api.md; the event is emitted before we respond.
  razorpayWebhook = async (req: Request, res: Response): Promise<Response> => {
    this.engine.razorpayWebhook(req.body);
    return res.status(202).json({ success: true, data: { received: true } });
  };
  getFollowups = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.getFollowups(req.params.bookingId));

  // Policy & content (M14/M15/M16)
  getPolicy = async (req: Request, res: Response): Promise<Response> =>
    ok(res, this.engine.getPolicy({ scope: q(req.query.scope), partner_id: q(req.query.partner_id) }));
  getRoutePacks = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.getRoutePacks(q(req.query.destination)));
  getPois = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.getPois(q(req.query.destination)));
  getPackages = async (req: Request, res: Response): Promise<Response> =>
    ok(res, this.engine.getPackages({ destination: q(req.query.destination), occasion: q(req.query.occasion) }));
  packageDelta = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.packageDelta(req.params.packageId, req.body));
}
