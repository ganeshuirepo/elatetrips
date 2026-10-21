/**
 * Razorpay webhook authentication tests.
 * Run: `npm test` (Node's own runner; see scripts/register-ts.js).
 *
 * The failure being prevented: an unsigned webhook endpoint is a public
 * "mark this booking paid" button, because the caller supplies the booking id
 * and the server believes it.
 *
 * `env` is read live by the guard, so these set process.env and restore it.
 * The secret is only read inside the handler, not at module load.
 */
import { strict as assert } from 'node:assert';
import { createHmac } from 'node:crypto';
import { afterEach, test } from 'node:test';
import type { Request, Response } from 'express';
import { razorpayWebhookGuard } from './webhookSignature';
import { AppError } from '../errors/AppError';

const SECRET = 'whsec-test-value';
const BODY = JSON.stringify({ booking_id: 'bkg-001', amount: 1000 });

const REAL = {
  secret: process.env.RAZORPAY_WEBHOOK_SECRET,
  nodeEnv: process.env.NODE_ENV,
};

afterEach(() => {
  if (REAL.secret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
  else process.env.RAZORPAY_WEBHOOK_SECRET = REAL.secret;
  if (REAL.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = REAL.nodeEnv;
});

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** Run the guard over a fake request, returning whatever it passed to next(). */
function run(opts: { body?: string; signature?: string }): AppError | undefined | 'passed' {
  const req = {
    rawBody: opts.body === undefined ? undefined : Buffer.from(opts.body, 'utf8'),
    header: (name: string) =>
      name.toLowerCase() === 'x-razorpay-signature' ? opts.signature : undefined,
  } as unknown as Request;

  let outcome: AppError | undefined | 'passed';
  razorpayWebhookGuard()(req, {} as Response, ((err?: unknown) => {
    outcome = err === undefined ? 'passed' : (err as AppError);
  }) as never);
  return outcome;
}

/** Assert the guard rejected with a specific status. */
function assertRejected(outcome: ReturnType<typeof run>, status: number): void {
  assert.ok(outcome instanceof AppError, `expected a rejection, got ${String(outcome)}`);
  assert.equal(outcome.statusCode, status);
}

// ------------------------------------------------ with a secret configured ----

test('accepts a correctly signed payload', () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  assert.equal(run({ body: BODY, signature: sign(BODY) }), 'passed');
});

test('rejects a payload with no signature header', () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  assertRejected(run({ body: BODY }), 401);
});

test('rejects a signature computed with the wrong secret', () => {
  // What an attacker who has read the source but not the environment can do.
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  assertRejected(run({ body: BODY, signature: sign(BODY, 'guessed-secret') }), 401);
});

test('rejects a valid signature attached to a DIFFERENT body', () => {
  // The replay that matters: capture one real webhook, keep its signature, and
  // swap in another booking id.
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  const tampered = JSON.stringify({ booking_id: 'bkg-999', amount: 1000 });
  assertRejected(run({ body: tampered, signature: sign(BODY) }), 401);
});

test('rejects a malformed signature without throwing', () => {
  // timingSafeEqual throws on unequal buffer lengths — a short header must
  // come back as a clean 401, not a 500 that leaks a stack trace.
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  for (const bad of ['', 'abc', 'z'.repeat(63), 'z'.repeat(65)]) {
    assertRejected(run({ body: BODY, signature: bad }), 401);
  }
});

test('rejects when the raw body was never captured', () => {
  // No buffer means nothing was verified, so nothing can be trusted.
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  assertRejected(run({ signature: sign(BODY) }), 400);
});

// --------------------------------------------- with no secret configured ----

test('production refuses every webhook when no secret is set', () => {
  // Failing closed: an unconfigured verifier must not mean "allow everything".
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.NODE_ENV = 'production';
  assertRejected(run({ body: BODY, signature: sign(BODY) }), 503);
});

test('development passes it through so the mock flow stays usable', () => {
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.NODE_ENV = 'development';
  assert.equal(run({ body: BODY }), 'passed');
});
