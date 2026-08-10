import type { Request, Response } from 'express';
import { ok } from '../../common/http/ApiResponse';
import { UnauthorizedError } from '../../common/errors/AppError';
import type { ConsoleClaims } from '../admin/console.token';
import type { SupportService } from './support.service';
import { supportBus } from './support.stream';

/**
 * Three audiences, one controller: the guest thread (user JWT, scoped to the
 * caller's phone), the vendor crew app (console login, role 'crew') and the
 * ops console (console login, roles 'cm'/'om') — identity always comes from
 * the verified token, never from a client-supplied header — plus the SSE
 * stream everyone shares for real-time updates.
 */
export class SupportController {
  constructor(private readonly service: SupportService) {}

  private phoneOf(req: Request): string {
    if (!req.user?.phone) throw new UnauthorizedError();
    return req.user.phone;
  }

  /** The signed console claims consoleGuard verified; refId binds the row. */
  private claimsOf(res: Response): ConsoleClaims & { refId: string } {
    const claims = res.locals.console as ConsoleClaims | undefined;
    if (!claims?.refId) throw new UnauthorizedError('Console account not bound to a support row');
    return { ...claims, refId: claims.refId };
  }

  // ---- guest ----------------------------------------------------------------

  thread = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.getThread(this.phoneOf(req), req.params.tripId));

  message = async (req: Request, res: Response): Promise<Response> => {
    await this.service.postMessage(this.phoneOf(req), req.params.tripId, req.body.text);
    return ok(res, { sent: true });
  };

  pref = async (req: Request, res: Response): Promise<Response> => {
    await this.service.setPref(this.phoneOf(req), req.params.tripId, req.body.pref);
    return ok(res, { saved: true });
  };

  photoDecision = async (req: Request, res: Response): Promise<Response> => {
    await this.service.photoDecision(
      this.phoneOf(req), req.params.tripId, req.body.milestoneId, req.body.approve, req.body.reason,
    );
    return ok(res, { saved: true });
  };

  // ---- vendor crew app ------------------------------------------------------

  vendorTasks = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.vendorTasks(this.claimsOf(res).refId));

  updateTask = async (req: Request, res: Response): Promise<Response> => {
    await this.service.updateTask(this.claimsOf(res).refId, req.params.milestoneId, req.body.state, {
      photoUrl: req.body.photoUrl,
      newStart: req.body.newStart,
      note: req.body.note,
    });
    return ok(res, { saved: true });
  };

  vendorNotes = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.vendorNotes(this.claimsOf(res).refId, req.params.tripId));

  vendorNote = async (req: Request, res: Response): Promise<Response> => {
    await this.service.vendorNote(this.claimsOf(res).refId, req.params.tripId, req.body.text);
    return ok(res, { sent: true });
  };

  // ---- ops console ----------------------------------------------------------

  board = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.board());

  tickets = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.tickets(typeof req.query.city === 'string' ? req.query.city : undefined));

  ticketAction = async (req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.ticketAction(
      req.params.ticketId, this.claimsOf(res).refId, req.body.action, req.body.resolution,
    ));

  reviewPhoto = async (req: Request, res: Response): Promise<Response> => {
    await this.service.reviewPhoto(req.params.milestoneId, req.body.approve, req.body.comment);
    return ok(res, { saved: true });
  };

  replaceVendor = async (req: Request, res: Response): Promise<Response> => {
    await this.service.replaceVendor(req.params.milestoneId, this.claimsOf(res).refId);
    return ok(res, { saved: true });
  };

  opsThread = async (req: Request, res: Response): Promise<Response> => {
    const c = this.claimsOf(res);
    return ok(res, await this.service.opsThread({ role: c.role, refId: c.refId }, req.params.tripId));
  };

  opsMessage = async (req: Request, res: Response): Promise<Response> => {
    const c = this.claimsOf(res);
    // consoleGuard already restricted the route to cm/om.
    await this.service.opsMessage(
      { role: c.role as 'cm' | 'om', refId: c.refId, name: c.name },
      req.params.tripId,
      req.body.text,
      req.body.internal === true,
    );
    return ok(res, { sent: true });
  };

  staff = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.staffDirectory());

  vendors = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, await this.service.vendorDirectory());

  // ---- real-time ------------------------------------------------------------

  /**
   * Server-sent events: one long-lived response per open tab. Every support
   * mutation is broadcast; clients filter by scope/tripId and refetch. A
   * heartbeat comment every 25s keeps proxies from reaping idle connections.
   */
  stream = (req: Request, res: Response): void => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx: do not buffer this response
    });
    res.write(': connected\n\n');
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    const unsubscribe = supportBus.onEvent((e) => {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    });
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  };
}
