/**
 * OTP store tests — the primitive every sign-in and channel proof rests on.
 * Run: `npm test` (Node's own runner; see scripts/register-ts.js).
 *
 * What these pin down, in order of what would hurt most if it broke:
 *   • a code is single-use — a replayable code is a password that never expires;
 *   • a code expires — an old SMS on a lost handset must stop working;
 *   • guessing is capped — 6 digits is only 10^6, trivial to brute force;
 *   • re-issuing invalidates the previous code, so only the newest one works;
 *   • a resend cooldown exists, because every send is a real provider bill.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { InMemoryOtpStore } from './otp.store';
import { AppError } from '../../common/errors/AppError';

const ID = '9876543210';

/** Fresh store per test — these share no state by design. */
const store = (): InMemoryOtpStore => new InMemoryOtpStore();

test('issues a six-digit numeric code', () => {
  const code = store().issue(ID);
  assert.match(code, /^\d{6}$/);
});

test('pads a small random draw instead of emitting a short code', () => {
  // randomInt(0, 1e6) legitimately returns e.g. 42; without padStart that would
  // be a 2-digit OTP, and the client's 6-digit input would never match it.
  const s = store();
  for (let i = 0; i < 500; i++) {
    assert.equal(s.issue(`id-${i}`).length, 6);
  }
});

test('accepts the correct code exactly once', () => {
  const s = store();
  const code = s.issue(ID);
  assert.equal(s.verify(ID, code), true);
  // Replay: the same code must not work a second time.
  assert.equal(s.verify(ID, code), false);
});

test('rejects a code that was never issued', () => {
  assert.equal(store().verify(ID, '123456'), false);
});

test('rejects the right code offered for a different identifier', () => {
  // Otherwise a code sent to one account would open another.
  const s = store();
  const code = s.issue(ID);
  assert.equal(s.verify('9000000000', code), false);
});

test('expires a code, and expiry fails closed', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  const s = store();
  const code = s.issue(ID);
  t.mock.timers.tick(5 * 60 * 1000 + 1); // TTL is 5 minutes
  assert.equal(s.verify(ID, code), false);
});

test('still accepts a code just inside its lifetime', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  const s = store();
  const code = s.issue(ID);
  t.mock.timers.tick(4 * 60 * 1000);
  assert.equal(s.verify(ID, code), true);
});

test('burns the code after too many wrong guesses', () => {
  // 6 digits is 10^6 — without a cap, a live code is brute-forceable in minutes.
  const s = store();
  const code = s.issue(ID);
  for (let i = 0; i < 5; i++) {
    assert.equal(s.verify(ID, '000000'), false);
  }
  // Even the RIGHT code is now dead: the attempt budget is spent.
  assert.equal(s.verify(ID, code), false);
});

test('a wrong guess does not invalidate the code before the cap', () => {
  const s = store();
  const code = s.issue(ID);
  assert.equal(s.verify(ID, '000000'), false);
  assert.equal(s.verify(ID, code), true);
});

test('re-issuing invalidates the previous code', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  const s = store();
  const first = s.issue(ID);
  t.mock.timers.tick(31 * 1000); // past the resend cooldown
  const second = s.issue(ID);
  assert.notEqual(first, second);
  // Only the newest code verifies — otherwise every resend widens the window.
  assert.equal(s.verify(ID, first), false);
  assert.equal(s.verify(ID, second), true);
});

test('refuses a rapid re-issue with 429 rather than spending another send', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  const s = store();
  s.issue(ID);
  assert.throws(
    () => s.issue(ID),
    (err: unknown) => err instanceof AppError && err.statusCode === 429,
  );
});

test('allows the re-issue once the cooldown has run down', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  const s = store();
  s.issue(ID);
  t.mock.timers.tick(30 * 1000);
  assert.doesNotThrow(() => s.issue(ID));
});

test('the cooldown is per identifier, not global', () => {
  // A shared cooldown would let one account's traffic block everyone else's.
  const s = store();
  s.issue(ID);
  assert.doesNotThrow(() => s.issue('9000000000'));
});
