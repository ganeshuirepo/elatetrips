import type { Request, Response } from 'express';
import type { ReviewService } from './review.service';
import { ok, created } from '../../common/http/ApiResponse';
import { UnauthorizedError } from '../../common/errors/AppError';
import type { CreateReviewInput } from './review.types';

/** Thin HTTP adapter for hotel guest reviews. */
export class ReviewController {
  constructor(private readonly service: ReviewService) {}

  private phoneOf(req: Request): string {
    if (!req.user?.phone) throw new UnauthorizedError();
    return req.user.phone;
  }

  list = async (req: Request, res: Response): Promise<Response> => {
    const reviews = await this.service.list(req.params.hotelId);
    return ok(res, reviews, { count: reviews.length });
  };

  create = async (req: Request, res: Response): Promise<Response> => {
    const review = await this.service.add(
      this.phoneOf(req),
      req.params.hotelId,
      req.body as CreateReviewInput,
    );
    return created(res, review);
  };
}
