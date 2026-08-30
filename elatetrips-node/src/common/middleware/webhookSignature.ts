import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import { logger } from '../logger';
import { env } from '../../config/env';

/**
 * Razorpay webhook authentication.
 *
 * A payment webhook is an instruction to treat money as received, arriving from
 * the open internet. Without a signature check the endpoint is simply a public
 * "mark this booking paid" button — the caller supplies the booking id and the
 * server believes it.
 *
 * Razorpay signs the RAW request body with the webhook secret and sends the
 * digest in `x-razorpay-signature`. The raw bytes matter: re-serialising the
 * parsed JSON changes key order and whitespace, which changes the digest, so
 * app.ts captures the buffer for /webhooks/ paths and we verify against that.
 *
 * Configuration is deliberately not a degraded mode. With no secret set the
 * endpoint cannot authenticate anybody, so in production it refuses every
 * request rather than quietly accepting them all; in development it passes with
 * a loud warning so the mock flow stays usable.
 */
export function razorpayWebhookGuard(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const secret = env.razorpayWebhookSecret;

    if (!secret) {
      if (env.isProd) {
        logger.error(
          'RAZORPAY_WEBHOOK_SECRET is not set — refusing the webhook. An unverified ' +
          'payment webhook can mark any booking paid.',
        );
        next(new AppError(503, 'Webhook verification is not configured'));
        return;
      }
      logger.warn('[webhook] RAZORPAY_WEBHOOK_SECRET unset — signature NOT verified (dev only).');
      next();
      return;
    }

    const raw = req.rawBody;
    if (!raw?.length) {
      // No buffer means the body never went through the json parser (wrong
      // content-type, or an empty POST). Nothing to verify, so nothing to trust.
      next(new AppError(400, 'Webhook body missing or unreadable'));
      return;
    }

    const header = req.header('x-razorpay-signature');
    if (!header) {
      next(new AppError(401, 'Missing webhook signature'));
      return;
    }

    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    // Both are fixed-length hex digests, so the lengths already match; the
    // guard is for a malformed header, which timingSafeEqual would throw on.
    const given = Buffer.from(header, 'utf8');
    const want = Buffer.from(expected, 'utf8');
    if (given.length !== want.length || !timingSafeEqual(given, want)) {
      logger.warn('[webhook] Razorpay signature mismatch — rejected.');
      next(new AppError(401, 'Invalid webhook signature'));
      return;
    }

    next();
  };
}
