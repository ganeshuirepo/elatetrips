import type { Request, Response } from 'express';
import { created, ok } from '../../common/http/ApiResponse';
import type { ConsoleService } from './console.service';
import type { ConsoleClaims } from './console.token';

/**
 * Transport for console accounts: login, vendor onboarding, vendor self-view.
 * Thin over ConsoleService. On the guarded routes the authenticated identity is
 * read from res.locals.console (the ConsoleClaims that consoleGuard/buildAdminGuard
 * put there) and passed to the service — so the service never trusts client input
 * for who the caller is.
 */
export class ConsoleController {
  constructor(private readonly service: ConsoleService) {}

  login = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.login(req.body.username, req.body.password));
  };

  createVendor = async (req: Request, res: Response): Promise<void> => {
    created(res, await this.service.createVendor(req.body));
  };

  listVendors = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.listVendors());
  };

  me = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.me(res.locals.console as ConsoleClaims));
  };

  updateListing = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.updateListing(res.locals.console as ConsoleClaims, req.body));
  };

  myOrders = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.vendorOrders(res.locals.console as ConsoleClaims));
  };
}
