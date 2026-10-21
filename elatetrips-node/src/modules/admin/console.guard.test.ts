/**
 * partnerScopedGuard tests — the control that makes `/partner/ratecard/:partnerId`
 * safe to address by id.
 * Run: `npm test` (Node's own runner; see scripts/register-ts.js).
 *
 * The whole point: a partner id is an ADDRESS, not a secret. It is short, it is
 * quoted in emails, and it is guessable. So the id in the URL must never be the
 * thing that grants access — this guard is. If it regresses, every partner's
 * negotiated rates become readable by anyone who can change a number in a URL.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import type { Request, Response } from 'express';
import { partnerScopedGuard } from './console.guard';
import { signConsoleToken } from './console.token';
import { AppError } from '../../common/errors/AppError';
import type { ConsoleRole } from './console.model';

/** Mint a real console token, so verification is genuinely exercised. */
function token(over: { role: ConsoleRole; partnerId?: string }): string {
  return signConsoleToken({
    sub: 'someone',
    name: 'Someone',
    role: over.role,
    partnerId: over.partnerId,
  });
}

/** Run the guard, returning 'passed' or the AppError it rejected with. */
function run(opts: { auth?: string; partnerId?: string }): 'passed' | AppError {
  const req = {
    headers: opts.auth === undefined ? {} : { authorization: opts.auth },
    params: opts.partnerId === undefined ? {} : { partnerId: opts.partnerId },
  } as unknown as Request;
  const res = { locals: {} } as unknown as Response;

  let outcome: 'passed' | AppError = 'passed';
  partnerScopedGuard('admin', 'cm', 'om')(req, res, ((err?: unknown) => {
    if (err !== undefined) outcome = err as AppError;
  }) as never);
  return outcome;
}

function assertRejected(outcome: 'passed' | AppError, status: number): void {
  assert.ok(outcome instanceof AppError, `expected a rejection, got ${String(outcome)}`);
  assert.equal(outcome.statusCode, status);
}

test('a partner reaches its own rate card', () => {
  const auth = `Bearer ${token({ role: 'vendor', partnerId: 'sup-001' })}`;
  assert.equal(run({ auth, partnerId: 'sup-001' }), 'passed');
});

test('a partner cannot reach somebody else’s by changing the id', () => {
  // The attack the whole guard exists for.
  const auth = `Bearer ${token({ role: 'vendor', partnerId: 'sup-001' })}`;
  assertRejected(run({ auth, partnerId: 'sup-002' }), 403);
});

test('an ops role may act for any partner', () => {
  for (const role of ['admin', 'cm', 'om'] as ConsoleRole[]) {
    const auth = `Bearer ${token({ role })}`;
    assert.equal(run({ auth, partnerId: 'sup-999' }), 'passed', role);
  }
});

test('a vendor with no partner bound gets nothing', () => {
  // Fails closed. Without this, an unbound account would compare
  // undefined against undefined and inherit access to every partner.
  const auth = `Bearer ${token({ role: 'vendor' })}`;
  assertRejected(run({ auth, partnerId: 'sup-001' }), 403);
});

test('an unbound account is refused even when the path names no partner', () => {
  const auth = `Bearer ${token({ role: 'vendor' })}`;
  assertRejected(run({ auth }), 403);
});

test('a crew token does not become a supply account', () => {
  // 'crew' is an ops-adjacent role that is NOT in the allowed list, and holds
  // no partnerId — it must not drift into rate-card access.
  const auth = `Bearer ${token({ role: 'crew' })}`;
  assertRejected(run({ auth, partnerId: 'sup-001' }), 403);
});

test('no token at all is a 401, not a 403', () => {
  // Different answer on purpose: "you are not signed in" is actionable,
  // "this is not yours" is not.
  assertRejected(run({ partnerId: 'sup-001' }), 401);
});

test('a forged or tampered token is refused', () => {
  assertRejected(run({ auth: 'Bearer not.a.real.token', partnerId: 'sup-001' }), 401);
});

test('a traveller JWT is not a console token', () => {
  // Both are signed with the SAME secret, so a valid signature proves nothing
  // on its own — only the console scope separates a customer's session from a
  // supply-side one. Minted here the way auth/token.service mints it.
  const travellerToken = jwt.sign({ phone: '9876543210' }, env.jwtSecret, { expiresIn: '1h' });
  assertRejected(run({ auth: `Bearer ${travellerToken}`, partnerId: 'sup-001' }), 401);
});

test('the refusal does not reveal whether the partner exists', () => {
  // Same message for a real-but-not-yours id and a made-up one, so the endpoint
  // cannot be walked to discover which partner ids are real.
  const auth = `Bearer ${token({ role: 'vendor', partnerId: 'sup-001' })}`;
  const real = run({ auth, partnerId: 'sup-002' });
  const fake = run({ auth, partnerId: 'nope-does-not-exist' });
  assert.ok(real instanceof AppError && fake instanceof AppError);
  assert.equal(real.message, fake.message);
});
