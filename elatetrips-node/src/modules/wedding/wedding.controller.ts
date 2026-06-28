import type { Request, Response } from 'express';
import type { WeddingService } from './wedding.service';
import { created } from '../../common/http/ApiResponse';

/**
 * Thin HTTP adapter for the public wedding-enquiry endpoint. The body is already
 * validated by middleware; the controller records it and echoes the stored
 * enquiry (including its reference id).
 */
export class WeddingController {
  constructor(private readonly service: WeddingService) {}

  create = async (req: Request, res: Response): Promise<Response> =>
    created(res, await this.service.createEnquiry(req.body));
}
