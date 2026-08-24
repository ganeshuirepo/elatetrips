/**
 * ClassifierController — thin HTTP adapter over ClassifierService. Reads the
 * already-validated request (validate() middleware ran the Zod schemas at the
 * edge), delegates to the service, and writes the uniform `{ success, data }`
 * envelope via ok(). No business logic here (Single Responsibility).
 */
import type { Request, Response } from 'express';
import { ok } from '../../common/http/ApiResponse';
import type { ClassifierService } from './classifier.service';
import type { ClassifierItinerary, ClassifierRfq, FulfilmentRoute } from './classifier.types';

export class ClassifierController {
  constructor(private readonly service: ClassifierService) {}

  classify = async (req: Request, res: Response): Promise<Response> => {
    const { rfq, itinerary } = req.body as { rfq: ClassifierRfq; itinerary: ClassifierItinerary };
    return ok(res, this.service.classify(rfq, itinerary));
  };

  upgrade = async (req: Request, res: Response): Promise<Response> => {
    const { rfq, itinerary, phase } = req.body as {
      rfq: ClassifierRfq;
      itinerary: ClassifierItinerary;
      phase: 'pre_booking' | 'post_booking';
    };
    return ok(res, this.service.upgrade(rfq, itinerary, phase));
  };

  override = async (req: Request, res: Response): Promise<Response> => {
    const body = req.body as { rfq_id: string; route: FulfilmentRoute; actor: string; reason?: string };
    return ok(res, this.service.override(body));
  };

  getDecision = async (req: Request, res: Response): Promise<Response> => {
    const decision = this.service.getDecision(req.params.rfqId);
    return ok(res, decision ?? null);
  };

  getAudit = async (req: Request, res: Response): Promise<Response> => {
    const events = this.service.auditForRfq(req.params.rfqId);
    return ok(res, events, { count: events.length });
  };
}
