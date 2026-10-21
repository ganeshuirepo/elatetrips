/**
 * Recipient-bound supplier link tests (BR-15).
 * Run: `npm test` (Node's own runner; see scripts/register-ts.js).
 *
 * These links are mailed to real partners and possession of one opens that
 * partner's RFQ — so the token IS the credential. It used to come from the
 * engine's sequential entity-id counter, which made every partner's link
 * reachable by counting up from `tok-001`.
 *
 * What these pin down:
 *   • tokens and OTPs are unguessable, and never sequential;
 *   • a link expires, and an expired one is indistinguishable from a wrong one;
 *   • the OTP guess budget is finite;
 *   • entity ids stay readable and sequential, because the frozen contract
 *     fixtures are written against them and they grant nothing.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ContractsEngine } from './contracts.engine';
import rfq001 from './fixtures/rfq/rfq-001.json';

/** Run `fn`, returning the error it threw (Node's assert.throws returns void). */
function caught(fn: () => unknown): Error {
  try {
    fn();
  } catch (err) {
    return err as Error;
  }
  return assert.fail('expected the call to throw, but it returned');
}

/** An engine whose clock the test controls, so expiry is testable. */
function engineAt(now: () => Date): ContractsEngine {
  return new ContractsEngine({ now });
}

const FIXED = new Date('2026-09-01T10:00:00.000Z');
const fresh = (): ContractsEngine => engineAt(() => FIXED);

test('a token is long, random, and never a counter', () => {
  const engine = fresh();
  const a = engine.mintLink('rfq-001', 'sup-001');
  const b = engine.mintLink('rfq-001', 'sup-002');

  assert.notEqual(a.token, b.token);
  // The specific regression: `tok-001`, `tok-002`, …
  assert.equal(/^tok-\d+$/.test(a.token), false, 'token must not be sequential');
  // 32 random bytes in base64url — comfortably beyond guessing.
  assert.ok(a.token.length >= 40, `token too short: ${a.token.length}`);
});

test('minting many tokens never repeats one', () => {
  const engine = fresh();
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) seen.add(engine.mintLink('rfq-001', `sup-${i}`).token);
  assert.equal(seen.size, 500);
});

test('the OTP is a six-digit code, not a counter', () => {
  const engine = fresh();
  const link = engine.mintLink('rfq-001', 'sup-001');
  assert.match(link.otp, /^\d{6}$/);
  assert.equal(/^otp-\d+$/.test(link.otp), false, 'OTP must not be sequential');
});

test('OTPs vary between links', () => {
  // A shared or predictable code would make the token the only real secret.
  const engine = fresh();
  const codes = new Set<string>();
  for (let i = 0; i < 200; i++) codes.add(engine.mintLink('rfq-001', `sup-${i}`).otp);
  assert.ok(codes.size > 150, `only ${codes.size} distinct codes in 200 — too clustered`);
});

test('entity ids stay sequential and readable', () => {
  // Deliberate: these are quoted in support conversations and asserted by the
  // frozen contract fixtures. They are identifiers, never credentials — so the
  // security work above must not have swept them up.
  const engine = fresh();
  const draft: Record<string, unknown> = { ...rfq001 };
  delete draft.rfq_id;
  const rfq = engine.createRfq(draft as never) as { rfq_id: string };
  assert.match(rfq.rfq_id, /^rfq-\d{3}$/);
});

test('a link carries a real expiry, not the moment it was made', () => {
  // expires_ts used to be stamped with "now", which reads as already-expired.
  const engine = fresh();
  const link = engine.mintLink('rfq-001', 'sup-001');
  assert.ok(
    new Date(link.expires_ts).getTime() > FIXED.getTime(),
    'a link that expires when it is created is not a lifetime',
  );
});

test('an expired link is refused, and looks exactly like an unknown one', () => {
  // Same answer for both, so expiry cannot be probed to prove a token existed.
  let clock = FIXED;
  const engine = engineAt(() => clock);
  const link = engine.mintLink('rfq-001', 'sup-001');

  clock = new Date(FIXED.getTime() + 8 * 24 * 60 * 60 * 1000); // past the 7-day TTL

  const expired = caught(() => engine.getLink(link.token));
  const unknown = caught(() => engine.getLink('tok_does-not-exist'));
  assert.equal(expired.message, unknown.message);
});

test('a valid link still opens inside its lifetime', () => {
  let clock = FIXED;
  const engine = engineAt(() => clock);
  const link = engine.mintLink('rfq-001', 'sup-001');
  clock = new Date(FIXED.getTime() + 24 * 60 * 60 * 1000);
  assert.doesNotThrow(() => engine.getLink(link.token));
});

test('the OTP guess budget runs out, and the link dies with it', () => {
  // Six digits is 10^6. An unlimited budget makes the code decorative.
  const engine = fresh();
  const link = engine.mintLink('rfq-001', 'sup-001');

  for (let i = 0; i < 5; i++) {
    assert.throws(() => engine.linkQuote(link.token, { otp: '000000' }));
  }
  // Spent: even the correct code no longer works, because the link is gone.
  const after = caught(() => engine.linkQuote(link.token, { otp: link.otp }));
  assert.match(after.message, /no longer usable|not found|expired/i);
});
