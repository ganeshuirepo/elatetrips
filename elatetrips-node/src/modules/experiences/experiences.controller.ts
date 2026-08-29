import type { Request, Response } from 'express';
import type { ExperiencesService } from './experiences.service';
import { ok } from '../../common/http/ApiResponse';

/**
 * Thin HTTP adapter for the Experiences catalog.
 *
 * Caching is the interesting part. This is public content that changes when
 * someone runs an import, not per-request data, and its main consumer is a
 * phone that may be on one bar of signal. So every read carries a strong ETag
 * derived from the active bundles, and a matching `If-None-Match` gets a bare
 * 304 — the app keeps what it has and spends no bytes.
 */
export class ExperiencesController {
  constructor(private readonly service: ExperiencesService) {}

  /**
   * Applies the cache headers and answers 304 when the client is already
   * current. Returns true when the response is finished.
   */
  private async fresh(req: Request, res: Response): Promise<boolean> {
    const { revision } = await this.service.version();
    const etag = `"${revision}"`;
    res.setHeader('ETag', etag);
    // Five minutes: long enough that a browsing session makes one request,
    // short enough that an activated import reaches clients the same day
    // without anyone clearing a cache.
    res.setHeader('Cache-Control', 'public, max-age=300');
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return true;
    }
    return false;
  }

  version = async (req: Request, res: Response): Promise<Response | void> => {
    if (await this.fresh(req, res)) return;
    return ok(res, await this.service.version());
  };

  bundle = async (req: Request, res: Response): Promise<Response | void> => {
    if (await this.fresh(req, res)) return;
    return ok(res, await this.service.bundle());
  };

  catalog = async (req: Request, res: Response): Promise<Response | void> => {
    if (await this.fresh(req, res)) return;
    return ok(res, await this.service.catalog());
  };

  plans = async (req: Request, res: Response): Promise<Response | void> => {
    if (await this.fresh(req, res)) return;
    return ok(res, await this.service.plans());
  };

  occasions = async (req: Request, res: Response): Promise<Response | void> => {
    if (await this.fresh(req, res)) return;
    const classification = typeof req.query.classification === 'string' ? req.query.classification : undefined;
    const occasions = await this.service.occasions(classification);
    return ok(res, occasions, { count: occasions.length });
  };

  festivals = async (req: Request, res: Response): Promise<Response | void> => {
    if (await this.fresh(req, res)) return;
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const festivals = await this.service.festivals(from, to);
    return ok(res, festivals, { count: festivals.length });
  };

  destinations = async (req: Request, res: Response): Promise<Response | void> => {
    if (await this.fresh(req, res)) return;
    return ok(res, await this.service.destinations());
  };

  sections = async (req: Request, res: Response): Promise<Response | void> => {
    if (await this.fresh(req, res)) return;
    const classification = typeof req.query.classification === 'string' ? req.query.classification : undefined;
    return ok(res, await this.service.sections(classification));
  };

  addons = async (req: Request, res: Response): Promise<Response | void> => {
    if (await this.fresh(req, res)) return;
    const classification = typeof req.query.classification === 'string' ? req.query.classification : undefined;
    return ok(res, await this.service.addons(classification));
  };

  transport = async (req: Request, res: Response): Promise<Response | void> => {
    if (await this.fresh(req, res)) return;
    return ok(res, await this.service.transport());
  };

  plan = async (req: Request, res: Response): Promise<Response | void> => {
    if (await this.fresh(req, res)) return;
    const occasion = typeof req.query.occasion === 'string' ? req.query.occasion : '';
    // null, not 404: an occasion with no scripted plan is ordinary, and the
    // caller falls back to generating one. A 404 would read as "bad request".
    return ok(res, await this.service.plan(occasion));
  };
}
