/**
 * NegotiationController — the HTTP layer for /api/v1/negotiation. Thin adapters:
 * each reads the already-validated request, delegates to NegotiationService, and
 * writes the result through ok()/created() so every response shares the uniform
 * envelope. No business logic lives here (Single Responsibility).
 */
import type { Request, Response } from 'express';
import { ok, created } from '../../common/http/ApiResponse';
import type { NegotiationService } from './negotiation.service';
import type { NegotiationEventType } from './negotiation.audit';

export class NegotiationController {
  constructor(private readonly service: NegotiationService) {}

  /** POST /negotiation/decide — the single call M7 FR7.7 makes. */
  decide = async (req: Request, res: Response): Promise<Response> => {
    const { actor, ...input } = req.body;
    return ok(res, this.service.decide(input, actor));
  };

  /** GET /negotiation/config — the effective BR-17 config (no secrets). */
  getConfig = async (_req: Request, res: Response): Promise<Response> => ok(res, this.service.getConfig());

  /** GET /negotiation/rules?at= — the rule set effective at an instant. */
  activeRules = async (req: Request, res: Response): Promise<Response> =>
    ok(res, this.service.activeRuleSet(req.query.at as string | undefined) ?? null);

  /** GET /negotiation/rules/versions — full version history. */
  listVersions = async (_req: Request, res: Response): Promise<Response> =>
    ok(res, this.service.listVersions());

  /** GET /negotiation/rules/versions/:version */
  getVersion = async (req: Request, res: Response): Promise<Response> =>
    ok(res, this.service.getVersion(Number(req.params.version)));

  /** POST /negotiation/rules — publish a new version (dry-run gated for price rules). */
  publish = async (req: Request, res: Response): Promise<Response> =>
    created(res, this.service.publish(req.body));

  /** POST /negotiation/rules/dry-run — replay a candidate set over the corpus. */
  dryRun = async (req: Request, res: Response): Promise<Response> =>
    ok(res, this.service.dryRun(req.body.rules));

  /** POST /negotiation/rules/rollback — restore a prior version. */
  rollback = async (req: Request, res: Response): Promise<Response> =>
    created(res, this.service.rollback(req.body.to_version, req.body.actor));

  /** GET /negotiation/events — audit trail (optional quote_id / type filter). */
  events = async (req: Request, res: Response): Promise<Response> => {
    const quote_id = req.query.quote_id as string | undefined;
    const type = req.query.type as NegotiationEventType | undefined;
    return ok(res, this.service.events({ quote_id, type }));
  };
}
