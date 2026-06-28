import type { Response } from 'express';

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
