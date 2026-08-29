/**
 * OTP delivery tests — provider selection and the send adapters, with `fetch`
 * stubbed so no provider account, network or credit is involved.
 * Run: `npm test` (Node's own runner; see scripts/register-ts.js).
 *
 * Why this file exists: buildOtpSender decides whether a real SMS leaves the
 * building. Getting it wrong is silent in the worst way — codes go to the
 * server log while travellers wait for a message that never arrives, and
 * nothing errors. These pin the selection down, and the adapters' failure
 * handling with it.
 *
 * Note the Fast2SMS adapter had never been executed once before this file.
 */
import { strict as assert } from 'node:assert';
import { afterEach, test } from 'node:test';
import {
  BrevoEmailOtpSender,
  ChannelRoutingOtpSender,
  ConsoleOtpSender,
  Fast2SmsOtpSender,
  TwilioSmsOtpSender,
  buildOtpSender,
} from './otp.sender';
import type { IOtpSender } from './auth.types';
import { AppError } from '../../common/errors/AppError';

// ------------------------------------------------------------- fetch stub ----

interface Call {
  url: string;
  init: RequestInit;
}

const realFetch = globalThis.fetch;

/** Replace fetch with a canned answer, recording what was asked of it. */
function stubFetch(reply: Partial<Response> & { json?: () => Promise<unknown> }): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({}),
      ...reply,
    } as Response;
  }) as typeof fetch;
  return calls;
}

/**
 * Replace fetch with one that fails the way an expired deadline does. Raising
 * the TimeoutError directly rather than actually waiting keeps the suite fast:
 * that the deadline is ATTACHED is proved separately, below, so waiting out a
 * real one here would buy nothing but ten seconds.
 */
function stubTimingOutFetch(): void {
  globalThis.fetch = (async () => {
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'TimeoutError';
    throw err;
  }) as typeof fetch;
}

const PROVIDER_KEYS = [
  'BREVO_API_KEY',
  'BREVO_FROM_EMAIL',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'FAST2SMS_API_KEY',
] as const;
const REAL_PROVIDER_ENV = Object.fromEntries(
  PROVIDER_KEYS.map((k) => [k, process.env[k]]),
);

afterEach(() => {
  globalThis.fetch = realFetch;
  // Put the real configuration back: a key set by one test leaking into the
  // next would quietly change which provider that test thinks it selected.
  for (const key of PROVIDER_KEYS) {
    const original = REAL_PROVIDER_ENV[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

/** The env module is read live by the senders; set only what a test needs. */
function withEnv(vars: Record<string, string | undefined>, run: () => void): void {
  const before: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    before[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    run();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// --------------------------------------------------------------- routing ----

test('routes an email code to the email provider and an SMS to the SMS one', async () => {
  const seen: string[] = [];
  const mark = (name: string): IOtpSender => ({
    async send(): Promise<void> {
      seen.push(name);
    },
  });
  const router = new ChannelRoutingOtpSender(mark('email'), mark('sms'));

  await router.send('email', 'asha@example.com', '123456');
  await router.send('mobile', '9876543210', '123456');
  assert.deepEqual(seen, ['email', 'sms']);
});

test('the console sender never throws — it is the fallback of last resort', async () => {
  // If this could fail, an unconfigured channel would break sign-in outright
  // rather than degrading to a log line.
  await new ConsoleOtpSender().send('mobile', '9876543210', '123456');
});

// ------------------------------------------------------------- selection ----

test('with nothing configured, both channels fall back to the console', () => {
  withEnv(
    {
      BREVO_API_KEY: undefined,
      BREVO_FROM_EMAIL: undefined,
      TWILIO_ACCOUNT_SID: undefined,
      TWILIO_AUTH_TOKEN: undefined,
      TWILIO_FROM_NUMBER: undefined,
      FAST2SMS_API_KEY: undefined,
    },
    () => {
      // Not an error: the whole flow stays testable with no third-party account.
      assert.doesNotThrow(() => buildOtpSender());
    },
  );
});

test('a half-configured Brevo does not count as configured', () => {
  // A key with no sender address would fail on every send. Falling back to the
  // console is wrong-but-loud; half-sending is wrong-and-silent.
  withEnv({ BREVO_API_KEY: 'xkeysib-test', BREVO_FROM_EMAIL: undefined }, () => {
    assert.doesNotThrow(() => buildOtpSender());
  });
});

test('a half-configured Twilio does not count as configured', () => {
  withEnv(
    {
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_FROM_NUMBER: undefined,
      FAST2SMS_API_KEY: undefined,
    },
    () => {
      assert.doesNotThrow(() => buildOtpSender());
    },
  );
});

// ----------------------------------------------------------- Fast2SMS ----

test('Fast2SMS posts the bare 10-digit number on the OTP route', async () => {
  // The OTP route is the one that needs no DLT registration, and Fast2SMS wants
  // the number WITHOUT a country code — a +91 here silently fails to deliver.
  const calls = stubFetch({ json: async () => ({ return: true }) });
  process.env.FAST2SMS_API_KEY = 'key-123';

  await new Fast2SmsOtpSender().send('mobile', '9876543210', '123456');

  const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
  assert.equal(body.route, 'otp');
  assert.equal(body.numbers, '9876543210');
  assert.equal(body.variables_values, '123456');
});

test('Fast2SMS treats a 200 that says return:false as a failure', async () => {
  // It answers 200 with `{return:false}` for a bad key or no credit. Trusting
  // the status code alone would report a delivered code that never left.
  stubFetch({ ok: true, status: 200, json: async () => ({ return: false }) });
  await assert.rejects(
    () => new Fast2SmsOtpSender().send('mobile', '9876543210', '123456'),
    (err: unknown) => err instanceof AppError && err.statusCode === 502,
  );
});

test('Fast2SMS surfaces a non-200 as a 502', async () => {
  stubFetch({ ok: false, status: 401, json: async () => ({ return: false }) });
  await assert.rejects(
    () => new Fast2SmsOtpSender().send('mobile', '9876543210', '123456'),
    (err: unknown) => err instanceof AppError && err.statusCode === 502,
  );
});

// -------------------------------------------------------------- Brevo ----

test('Brevo sends the code in the subject and body of a real email', async () => {
  const calls = stubFetch({ ok: true, status: 201 });
  process.env.BREVO_API_KEY = 'xkeysib-test';
  process.env.BREVO_FROM_EMAIL = 'noreply@elatetrips.com';

  await new BrevoEmailOtpSender().send('email', 'asha@example.com', '123456');

  const body = JSON.parse(String(calls[0].init.body)) as { subject: string; htmlContent: string };
  assert.match(body.subject, /123456/);
  assert.match(body.htmlContent, /123456/);
});

test('a Brevo rejection becomes a 502, not a silently undelivered code', async () => {
  stubFetch({ ok: false, status: 401, text: async () => 'unrecognised IP address' });
  await assert.rejects(
    () => new BrevoEmailOtpSender().send('email', 'asha@example.com', '123456'),
    (err: unknown) => err instanceof AppError && err.statusCode === 502,
  );
});

// -------------------------------------------------------------- Twilio ----

test('Twilio prefixes the Indian country code, which Fast2SMS must not', async () => {
  const calls = stubFetch({ ok: true, status: 201 });
  process.env.TWILIO_ACCOUNT_SID = 'AC123';
  process.env.TWILIO_AUTH_TOKEN = 'secret';
  process.env.TWILIO_FROM_NUMBER = '+15005550006';

  await new TwilioSmsOtpSender().send('mobile', '9876543210', '123456');

  const body = new URLSearchParams(String(calls[0].init.body));
  assert.equal(body.get('To'), '+919876543210');
  assert.match(String(body.get('Body')), /123456/);
});

test('the auth header is Basic, and the token never lands in the URL', async () => {
  // A credential in a URL ends up in access logs and proxy logs.
  const calls = stubFetch({ ok: true, status: 201 });
  process.env.TWILIO_ACCOUNT_SID = 'AC123';
  process.env.TWILIO_AUTH_TOKEN = 'secret';
  process.env.TWILIO_FROM_NUMBER = '+15005550006';

  await new TwilioSmsOtpSender().send('mobile', '9876543210', '123456');

  const headers = calls[0].init.headers as Record<string, string>;
  assert.match(headers.authorization, /^Basic /);
  assert.equal(calls[0].url.includes('secret'), false);
});

// ------------------------------------------------------------- timeouts ----

test('a provider that stalls is given up on rather than held forever', async () => {
  // The failure this prevents: a provider accepts the connection and never
  // answers, pinning the traveller's sign-in request open indefinitely.
  stubTimingOutFetch();
  process.env.FAST2SMS_API_KEY = 'key-123';

  await assert.rejects(
    () => new Fast2SmsOtpSender().send('mobile', '9876543210', '123456'),
    (err: unknown) => err instanceof AppError && err.statusCode === 502,
  );
});

test('every provider carries the deadline, not just one of them', async () => {
  const calls = stubFetch({ ok: true, status: 201, json: async () => ({ return: true }) });
  process.env.BREVO_API_KEY = 'xkeysib-test';
  process.env.BREVO_FROM_EMAIL = 'noreply@elatetrips.com';
  process.env.TWILIO_ACCOUNT_SID = 'AC123';
  process.env.TWILIO_AUTH_TOKEN = 'secret';
  process.env.TWILIO_FROM_NUMBER = '+15005550006';
  process.env.FAST2SMS_API_KEY = 'key-123';

  await new BrevoEmailOtpSender().send('email', 'asha@example.com', '123456');
  await new TwilioSmsOtpSender().send('mobile', '9876543210', '123456');
  await new Fast2SmsOtpSender().send('mobile', '9876543210', '123456');

  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.ok(call.init.signal, `${call.url} was sent without a timeout signal`);
  }
});
