/**
 * Comms controller — thin HTTP adapter over CommsService. Reads the already-
 * validated request (validate() ran at the edge), calls the service, and returns
 * the uniform `{ success, data }` envelope. No business logic here (SRP).
 */
import type { Request, Response } from 'express';
import { ok, created } from '../../common/http/ApiResponse';
import { UnauthorizedError } from '../../common/errors/AppError';
import type { CommsService } from './comms.service';
import type { TemplateId } from './comms.templates';
import type { Channel } from './comms.types';

export class CommsController {
  constructor(private readonly service: CommsService) {}

  /** POST /comm/send — the integration point every other module uses. */
  send = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.service.sendTemplated({
      templateId: req.body.templateId as TemplateId,
      channel: req.body.channel as Channel,
      recipient: req.body.recipient,
      data: req.body.data,
      rfq_id: req.body.rfq_id,
      mint_link_purpose: req.body.mint_link_purpose,
      version: req.body.version,
    });
    return created(res, result);
  };

  /** POST /comm/verify — validate a magic link; 401 when it does not check out. */
  verify = async (req: Request, res: Response): Promise<Response> => {
    const result = this.service.verifyLink(req.body.token, {
      rfq_id: req.body.rfq_id,
      recipient_id: req.body.recipient_id,
    });
    if (!result.valid) throw new UnauthorizedError(`Invalid magic link: ${result.reason}`);
    return ok(res, { claims: result.claims });
  };

  /** POST /comm/inbound — store raw inbound and route to the M7 parser. */
  inbound = async (req: Request, res: Response): Promise<Response> =>
    created(res, this.service.captureInbound(req.body));

  /** POST /comm/delivery — provider delivery/open/click webhook. */
  delivery = async (req: Request, res: Response): Promise<Response> =>
    created(res, this.service.ingestDeliveryStatus(req.body));

  /** POST /comm/opt-out — permanent opt-out. */
  optOut = async (req: Request, res: Response): Promise<Response> => {
    this.service.optOut(req.body.recipient_id);
    return ok(res, { recipient_id: req.body.recipient_id, opted_out: true });
  };

  /** GET /comm/rfq/:rfqId/deliveries — delivery telemetry for one RFQ. */
  deliveries = async (req: Request, res: Response): Promise<Response> =>
    ok(res, this.service.deliveriesFor(req.params.rfqId));
}
