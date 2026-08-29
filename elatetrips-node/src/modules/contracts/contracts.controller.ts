/**
 * Contracts controller — thin HTTP adapter over the ContractsEngine. Reads the
 * typed request, calls the engine (which validates → 422, emits audit events,
 * masks supplier views), and returns the uniform `{ success, data }` envelope.
 * No business logic lives here (Single Responsibility).
 */
import type { Request, Response } from 'express';
import { ok } from '../../common/http/ApiResponse';
import type { ContractsEngine } from './contracts.engine';
import type { Quote, Rfq } from './contracts.types';

const q = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/**
 * The dispatcher, as this module sees it (implemented by M-flow's
 * RfqFlowService). An interface rather than the class so the frozen contracts
 * module keeps importing nothing from the orchestration layer, and so the
 * controller can be constructed without one — the endpoints behave exactly as
 * before when no dispatcher is wired.
 */
export interface RfqDispatchHook {
  onRfqSubmitted(rfq: Rfq, ctx: { customer_email?: string; customer_name?: string }): Promise<unknown>;
  onQuotesShortlisted(rfq: Rfq, quotes: Quote[], ctx: { customer_email?: string }): Promise<unknown>;
}

export class ContractsController {
  constructor(
    private readonly engine: ContractsEngine,
    private readonly dispatch?: RfqDispatchHook,
  ) {}

  // Intake (M1)
  createRfq = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.createRfq(req.body));
  patchRfq = async (req: Request, res: Response): Promise<Response> => ok(res, this.engine.patchRfq(req.params.rfqId, req.body));

  /**
   * Customer confirmation — and, since the dispatcher was wired, the moment the
   * whole RFQ workflow starts: partners are mailed the brief and the customer
   * gets their acknowledgement, with no ops step in between.
   *
   * The dispatch is AWAITED so that a submit which answers 200 has genuinely
   * been acted on; a background send would report success for mail that never
   * left. It cannot fail the request — RfqFlowService resolves with a report
   * rather than throwing — and the response body stays exactly the `rfq.schema`
   * that `/contracts/api.md` specifies. Where each message went is readable at
   * `GET /comm/rfq/{rfq_id}/deliveries`.
   */
  submitRfq = async (req: Request, res: Response): Promise<Response> => {
    const rfq = this.engine.submitRfq(req.params.rfqId);
    if (this.dispatch) {
      const body: Record<string, unknown> = typeof req.body === 'object' && req.body !== null ? req.body : {};
      await this.dispatch.onRfqSubmitted(rfq, {
        customer_email: q(body.customer_email),
        customer_name: q(body.customer_name),
      });
    }
    return ok(res, rfq);
  };

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
  /** Shortlisting is what makes a comparison worth sending, so it sends one. */
  shortlist = async (req: Request, res: Response): Promise<Response> => {
    const quotes = this.engine.shortlist(req.params.rfqId);
    const rfq = this.engine.getRfq(req.params.rfqId);
    // `shortlist` tolerates an unknown RFQ (it just ranks nothing), so the mail
    // is conditional on there actually being one to describe.
    if (this.dispatch && rfq) {
      const body: Record<string, unknown> = typeof req.body === 'object' && req.body !== null ? req.body : {};
      await this.dispatch.onQuotesShortlisted(rfq, quotes, { customer_email: q(body.customer_email) });
    }
    return ok(res, quotes);
  };
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
