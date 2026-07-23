import type { Response } from 'express';

/**
 * Success side of the uniform response envelope. Every endpoint returns
 * `{ success: true, data }` (optionally `meta`, e.g. pagination) through these
 * helpers; the mirror-image error shape `{ success: false, error }` is produced
 * centrally by errorHandler. Controllers call ok()/created() and never hand-build
 * JSON, so the client sees one predictable shape everywhere. ok → 200,
 * created → 201.
 */

/** Uniform success envelope so every endpoint returns the same shape. */
export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>): Response {
  const body: ApiEnvelope<T> = { success: true, data, ...(meta ? { meta } : {}) };
  return res.status(200).json(body);
}

export function created<T>(res: Response, data: T): Response {
  const body: ApiEnvelope<T> = { success: true, data };
  return res.status(201).json(body);
}
