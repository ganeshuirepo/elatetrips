/**
 * RFQ auto-dispatch tests. Run (no runner is wired into package.json, so invoke
 * Node's built-in runner directly):
 *
 *   TS_NODE_TRANSPILE_ONLY=1 node -r ts-node/register --test \
 *     src/modules/rfqflow/rfqflow.test.ts
 *
 * What they pin down, in order of what would hurt most if it broke:
 *   • nothing is sent unless the workflow is switched on (BR-17 inert default);
 *   • a supplier who has not consented, or whose contract needs re-accepting,
 *     is never written to (BR-2, FR3.10) — and the report says why;
 *   • each supplier gets the link minted for THEM, from a single wave (BR-15);
 *   • one bad recipient does not take down the wave, and never throws into the
 *     customer's submit;
 *   • the customer's acknowledgement states the number actually mailed;
 *   • the test-inbox redirect keeps the intended address visible;
 *   • money crosses from minor units to a readable price exactly once.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { describeRfqFlow, loadRfqFlowConfig } from './rfqflow.config';
import { RfqFlowService } from './rfqflow.service';
import type { CandidatePort, DispatchCandidate, MailPort, WavePort } from './rfqflow.types';
import {
  datesOf,
  datesShort,
  escapeHtml,
  moneyText,
  occasionOf,
  paxOf,
  quoteRows,
  windowText,
} from './rfqflow.format';
import { ConfigRecipientDirectory } from '../comms/comms.recipients';
import { SmtpChannelProvider, htmlToText, loadSmtpConfig } from '../comms/comms.smtp';
import type { Quote, Rfq } from '../contracts/contracts.types';
import type { SendRequest } from '../comms/comms.types';

// ---- fixtures --------------------------------------------------------------

const rfq = (over: Partial<Rfq> = {}): Rfq =>
  ({
    rfq_id: 'rfq-001',
    version: 1,
    status: 'submitted',
    occasion: { type: 'celebration', details: { celebrations: [{ kind: 'anniversary' }] } },
    destination: { mode: 'place', place: 'Coorg' },
    dates: { start: '2026-11-12', end: '2026-11-16', flex_days: 2 },
    travellers: { adults: 4, kids: [{ age: 7 }, { age: 3 }] },
    hotel: { budget_per_night: { amount: 900000, currency: 'INR' }, category: 4 },
    inclusions: ['meals'],
    ...over,
  }) as Rfq;

const candidate = (id: string, over: Partial<DispatchCandidate> = {}): DispatchCandidate => ({
  supplier_id: id,
  name: `DMC ${id}`,
  declared_tat_hours: 24,
  comms_consent: { email: true },
  contract_accepted: true,
  reacceptance_required: false,
  ...over,
});

interface Sent {
  templateId: string;
  recipient_id: string;
  email?: string;
  data: Record<string, unknown>;
}

/** A mail port that records, and fails whichever recipients you name. */
function fakeMail(failFor: string[] = []): { port: MailPort; sent: Sent[] } {
  const sent: Sent[] = [];
  const port: MailPort = {
    async sendTemplated(input) {
      sent.push({
        templateId: input.templateId,
        recipient_id: input.recipient.recipient_id,
        email: input.recipient.email,
        data: input.data ?? {},
      });
      if (failFor.includes(input.recipient.recipient_id)) {
        return { ok: false, channel: 'email', provider_message_id: '', error: 'mailbox full', accepted_ts: 'now' };
      }
      return { ok: true, channel: 'email', provider_message_id: `m-${sent.length}`, accepted_ts: 'now' };
    },
  };
  return { port, sent };
}

function fakeWave(): { port: WavePort; calls: number } {
  const state = { calls: 0 };
  const port: WavePort = {
    dispatchWave(_rfqId, body) {
      state.calls += 1;
      return {
        wave_no: state.calls,
        links: body.supplier_ids.map((supplier_id) => ({ supplier_id, token: `tok-${supplier_id}` })),
      };
    },
  };
  return { port, get calls() { return state.calls; } };
}

const fakeCandidates = (rows: DispatchCandidate[]): CandidatePort => ({
  candidatesFor: async () => rows,
});

const ENV_ON = {
  RFQFLOW_ENABLED: 'true',
  RFQFLOW_RESPONSE_WINDOW_HOURS: '24',
  RFQFLOW_LINK_BASE: 'https://elatetrips.example/partner/link',
  COMM_CUSTOMER_EMAIL: 'traveller@example.com',
  COMM_SUPPLIER_EMAILS: '{"sup-1":"one@dmc.example","sup-2":"two@dmc.example","sup-3":"three@dmc.example"}',
};

function build(env: Record<string, string | undefined>, rows: DispatchCandidate[], failFor: string[] = []) {
  const mail = fakeMail(failFor);
  const wave = fakeWave();
  const service = new RfqFlowService({
    config: loadRfqFlowConfig(env),
    candidates: fakeCandidates(rows),
    wave: wave.port,
    mail: mail.port,
    directory: new ConfigRecipientDirectory({ source: env }),
  });
  return { service, mail, wave };
}

// ---- the inert default -----------------------------------------------------

test('sends nothing at all until the workflow is switched on', async () => {
  const { service, mail, wave } = build({ ...ENV_ON, RFQFLOW_ENABLED: undefined }, [candidate('sup-1')]);
  const report = await service.onRfqSubmitted(rfq());

  assert.match(report.skipped ?? '', /RFQFLOW_ENABLED/);
  assert.equal(mail.sent.length, 0, 'a disabled workflow must not send');
  assert.equal(wave.calls, 0, 'and must not mint tokens either');
});

test('a server with none of the keys set is inert, and says so at boot', async () => {
  // This is production's actual shape. The deploy never writes .env, so none of
  // the RFQFLOW_/COMM_/SMTP_ keys exist there — and the point of this test is
  // that "off by default" is verified rather than asserted in a comment.
  const config = loadRfqFlowConfig({});
  assert.equal(config.enabled, false);
  assert.match(describeRfqFlow(config), /^\[rfqflow\] OFF/);

  const mail = fakeMail();
  const wave = fakeWave();
  const service = new RfqFlowService({
    config,
    candidates: fakeCandidates([candidate('sup-1'), candidate('sup-2')]),
    wave: wave.port,
    mail: mail.port,
    directory: new ConfigRecipientDirectory({ source: {} }),
  });

  const submitted = await service.onRfqSubmitted(rfq());
  const shortlisted = await service.onQuotesShortlisted(rfq(), [quote('q1', 'sup-1', 100000)]);

  assert.equal(mail.sent.length, 0, 'no mail may leave a server that was never switched on');
  assert.equal(wave.calls, 0);
  assert.ok(submitted.skipped);
  assert.ok(shortlisted.skipped);
});

test('the boot line names the risk when dispatch is on without a link base', () => {
  // A wave whose links are bare tokens is worse than no wave: the supplier gets
  // a mail they cannot act on, and we have spent the first impression.
  const on = loadRfqFlowConfig({ RFQFLOW_ENABLED: 'true' });
  assert.match(describeRfqFlow(on), /^\[rfqflow\] ON/);
  assert.match(describeRfqFlow(on), /WARNING: no RFQFLOW_LINK_BASE/);

  const complete = loadRfqFlowConfig({ ...ENV_ON });
  assert.doesNotMatch(describeRfqFlow(complete), /WARNING/);
});

// ---- who may be written to -------------------------------------------------

test('never writes to a supplier who has not consented or must re-accept', async () => {
  const rows = [
    candidate('sup-1'),
    candidate('sup-2', { comms_consent: { email: false } }),
    candidate('sup-3', { reacceptance_required: true }),
    candidate('sup-4', { contract_accepted: false }),
  ];
  const { service, mail } = build(ENV_ON, rows);
  const report = await service.onRfqSubmitted(rfq());

  const outcome = (id: string): string => report.suppliers.find((s) => s.recipient_id === id)?.outcome ?? 'missing';
  assert.equal(outcome('sup-1'), 'sent');
  assert.equal(outcome('sup-2'), 'no_consent');
  assert.equal(outcome('sup-3'), 'blocked_reacceptance');
  assert.equal(outcome('sup-4'), 'blocked_contract');

  const mailedSuppliers = mail.sent.filter((s) => s.templateId === 'rfq_dispatch').map((s) => s.recipient_id);
  assert.deepEqual(mailedSuppliers, ['sup-1'], 'only the eligible supplier is mailed');
});

test('a supplier we hold no address for is reported, not silently dropped', async () => {
  const env = { ...ENV_ON, COMM_SUPPLIER_EMAILS: '{"sup-1":"one@dmc.example"}' };
  const { service, mail } = build(env, [candidate('sup-1'), candidate('sup-2')]);
  const report = await service.onRfqSubmitted(rfq());

  assert.equal(report.suppliers.find((s) => s.recipient_id === 'sup-2')?.outcome, 'no_address');
  assert.equal(mail.sent.filter((s) => s.templateId === 'rfq_dispatch').length, 1);
});

test('the wave cap takes M3 order as given and records who was held back', async () => {
  const env = { ...ENV_ON, RFQFLOW_MAX_SUPPLIERS_PER_WAVE: '2' };
  const { service } = build(env, [candidate('sup-1'), candidate('sup-2'), candidate('sup-3')]);
  const report = await service.onRfqSubmitted(rfq());

  assert.equal(report.suppliers.find((s) => s.recipient_id === 'sup-3')?.outcome, 'skipped_cap');
  assert.equal(report.suppliers.filter((s) => s.outcome === 'sent').length, 2);
});

// ---- the links -------------------------------------------------------------

test('one wave mints the tokens, and each supplier gets their own link', async () => {
  const { service, mail, wave } = build(ENV_ON, [candidate('sup-1'), candidate('sup-2')]);
  await service.onRfqSubmitted(rfq());

  assert.equal(wave.calls, 1, 'minting twice would hand out a token the audit never saw');
  const links = mail.sent
    .filter((s) => s.templateId === 'rfq_dispatch')
    .map((s) => String(s.data.short_link));
  assert.deepEqual(links, [
    'https://elatetrips.example/partner/link/tok-sup-1',
    'https://elatetrips.example/partner/link/tok-sup-2',
  ]);
});

test('with no link base configured the mail carries the bare token', async () => {
  const { service, mail } = build({ ...ENV_ON, RFQFLOW_LINK_BASE: undefined }, [candidate('sup-1')]);
  await service.onRfqSubmitted(rfq());
  assert.equal(mail.sent[0].data.short_link, 'tok-sup-1');
});

// ---- resilience ------------------------------------------------------------

test('one failed send neither stops the wave nor throws into the submit', async () => {
  const { service, mail } = build(ENV_ON, [candidate('sup-1'), candidate('sup-2')], ['sup-1']);
  const report = await service.onRfqSubmitted(rfq());

  assert.equal(report.suppliers.find((s) => s.recipient_id === 'sup-1')?.outcome, 'failed');
  assert.equal(report.suppliers.find((s) => s.recipient_id === 'sup-1')?.detail, 'mailbox full');
  assert.equal(report.suppliers.find((s) => s.recipient_id === 'sup-2')?.outcome, 'sent');
  assert.ok(mail.sent.some((s) => s.templateId === 'rfq_ack'), 'the customer is still told');
});

test('a candidate lookup that blows up degrades to "no suppliers", not a 500', async () => {
  const mail = fakeMail();
  const service = new RfqFlowService({
    config: loadRfqFlowConfig(ENV_ON),
    candidates: { candidatesFor: async () => { throw new Error('mongo is having a moment'); } },
    wave: fakeWave().port,
    mail: mail.port,
    directory: new ConfigRecipientDirectory({ source: ENV_ON }),
  });

  const report = await service.onRfqSubmitted(rfq());
  assert.equal(report.suppliers.length, 0);
  assert.equal(report.customer?.outcome, 'sent');
});

// ---- what the customer is told ---------------------------------------------

test('the acknowledgement states the number actually mailed, not the number tried', async () => {
  const rows = [candidate('sup-1'), candidate('sup-2'), candidate('sup-3', { comms_consent: { email: false } })];
  const { service, mail } = build(ENV_ON, rows, ['sup-2']);
  await service.onRfqSubmitted(rfq());

  const ack = mail.sent.find((s) => s.templateId === 'rfq_ack');
  assert.ok(ack);
  // Three candidates, one refused for consent, one bounced: one real send.
  assert.equal(ack.data.supplier_count, 1);
});

test('the submit call can name the customer address, overriding the config fallback', async () => {
  const { service, mail } = build(ENV_ON, [candidate('sup-1')]);
  await service.onRfqSubmitted(rfq(), { customer_email: 'someone.else@example.com', customer_name: 'Asha' });

  const ack = mail.sent.find((s) => s.templateId === 'rfq_ack');
  assert.equal(ack?.email, 'someone.else@example.com');
  assert.equal(ack?.data.customer_name, 'Asha');
});

test('an RFQ with no place and no region cannot match suppliers, and says so', async () => {
  const { service, mail } = build(ENV_ON, [candidate('sup-1')]);
  const report = await service.onRfqSubmitted(rfq({ destination: { mode: 'suggest_for_me' } }));

  assert.match(report.skipped ?? '', /no destination/);
  assert.equal(mail.sent.filter((s) => s.templateId === 'rfq_dispatch').length, 0);
  assert.equal(report.customer?.outcome, 'sent', 'the customer is still acknowledged');
});

test('the supplier brief carries trip shape and no traveller identity (BR-3)', async () => {
  const { service, mail } = build(ENV_ON, [candidate('sup-1')]);
  await service.onRfqSubmitted(rfq(), { customer_email: 'traveller@example.com', customer_name: 'Asha' });

  const brief = mail.sent.find((s) => s.templateId === 'rfq_dispatch');
  const serialised = JSON.stringify(brief?.data ?? {});
  assert.doesNotMatch(serialised, /Asha/);
  assert.doesNotMatch(serialised, /traveller@example\.com/);
});

// ---- the quote comparison --------------------------------------------------

const quote = (id: string, supplier: string, amount: number, partial = false): Quote =>
  ({
    quote_id: id,
    rfq_id: 'rfq-001',
    supplier_id: supplier,
    itinerary_version: 1,
    line_items: [],
    total: { amount, currency: 'INR' },
    validity_ts: '2026-10-01',
    partial,
    channel: 'card',
    status: 'shortlisted',
  }) as Quote;

test('the comparison resolves supplier ids to names and prices them correctly', async () => {
  const mail = fakeMail();
  const service = new RfqFlowService({
    config: loadRfqFlowConfig(ENV_ON),
    candidates: fakeCandidates([]),
    wave: fakeWave().port,
    mail: mail.port,
    directory: new ConfigRecipientDirectory({ source: ENV_ON }),
    names: { nameFor: async (id) => (id === 'sup-1' ? 'Coorg Trails' : null) },
  });

  await service.onQuotesShortlisted(rfq(), [quote('q1', 'sup-1', 8400000), quote('q2', 'sup-9', 9100000, true)]);

  const summary = mail.sent.find((s) => s.templateId === 'quote_summary');
  const rows = String(summary?.data.quote_rows);
  assert.match(rows, /Coorg Trails/);
  assert.match(rows, /INR 84,000/, 'minor units are converted exactly once');
  assert.match(rows, /sup-9/, 'an unresolved name falls back to the id rather than dropping the row');
  assert.match(rows, /partial/);
  assert.equal(summary?.data.quote_count, 2);
});

test('an expired price is never quoted to a customer', async () => {
  const mail = fakeMail();
  const service = new RfqFlowService({
    config: loadRfqFlowConfig(ENV_ON),
    candidates: fakeCandidates([]),
    wave: fakeWave().port,
    mail: mail.port,
    directory: new ConfigRecipientDirectory({ source: ENV_ON }),
    now: () => new Date('2026-10-15T00:00:00.000Z'),
  });

  const lapsed = { ...quote('q-old', 'sup-1', 5000000), validity_ts: '2026-09-01' } as Quote;
  const live = { ...quote('q-new', 'sup-2', 6600000), validity_ts: '2026-12-01' } as Quote;
  await service.onQuotesShortlisted(rfq(), [lapsed, live]);

  const summary = mail.sent.find((s) => s.templateId === 'quote_summary');
  assert.equal(summary?.data.quote_count, 1, 'the lapsed quote is dropped from the count');
  assert.doesNotMatch(String(summary?.data.quote_rows), /50,000/);
  assert.match(String(summary?.data.quote_rows), /66,000/);

  // …and when every one has lapsed, no mail goes at all.
  const allLapsed = await service.onQuotesShortlisted(rfq(), [lapsed]);
  assert.match(allLapsed.skipped ?? '', /expired/);
});

test('a quote with no readable validity date is shown rather than hidden', async () => {
  const mail = fakeMail();
  const service = new RfqFlowService({
    config: loadRfqFlowConfig(ENV_ON),
    candidates: fakeCandidates([]),
    wave: fakeWave().port,
    mail: mail.port,
    directory: new ConfigRecipientDirectory({ source: ENV_ON }),
    now: () => new Date('2026-10-15T00:00:00.000Z'),
  });

  const undated = { ...quote('q1', 'sup-1', 6600000), validity_ts: 'whenever' } as Quote;
  await service.onQuotesShortlisted(rfq(), [undated]);
  assert.equal(mail.sent.find((s) => s.templateId === 'quote_summary')?.data.quote_count, 1);
});

test('no quotes means no mail', async () => {
  const { service, mail } = build(ENV_ON, []);
  const report = await service.onQuotesShortlisted(rfq(), []);
  assert.match(report.skipped ?? '', /nothing to compare/);
  assert.equal(mail.sent.length, 0);
});

// ---- pure formatting -------------------------------------------------------

test('formatting reads the way a person would write it', () => {
  assert.equal(paxOf(rfq()), '4 adults + 2 children');
  assert.equal(paxOf(rfq({ travellers: { adults: 1, kids: [{ age: 5 }] } })), '1 adult + 1 child');
  assert.equal(paxOf(rfq({ travellers: { adults: 2, kids: [] } })), '2 adults');

  assert.equal(datesOf(rfq()), '12 Nov 2026 to 16 Nov 2026 (±2 days)');
  assert.equal(datesOf(rfq({ dates: { flex_days: 0 } })), 'dates flexible');

  // The subject-line form: no nested brackets, and one month name when it can.
  assert.equal(datesShort(rfq({ dates: { start: '2026-10-11', end: '2026-10-15', flex_days: 2 } })), '11–15 Oct 2026');
  assert.equal(
    datesShort(rfq({ dates: { start: '2026-10-29', end: '2026-11-03', flex_days: 0 } })),
    '29 Oct – 3 Nov 2026',
  );
  assert.equal(datesShort(rfq({ dates: { flex_days: 0 } })), 'dates flexible');

  assert.equal(occasionOf(rfq()), 'Celebration — anniversary');
  assert.equal(occasionOf(rfq({ occasion: { type: 'adventure' } })), 'Adventure');

  assert.equal(windowText(24), '24 hours');
  assert.equal(windowText(72), '3 days');
  assert.equal(windowText(undefined), 'as soon as you can');

  // The one that silently ships a price 100× wrong if it regresses.
  assert.equal(moneyText({ amount: 8400000, currency: 'INR' }), 'INR 84,000');
  assert.equal(moneyText(undefined), '—');
});

test('supplier names are escaped before they reach an HTML mail', () => {
  assert.equal(escapeHtml('Smith & Co <script>'), 'Smith &amp; Co &lt;script&gt;');
  const rows = quoteRows([quote('q1', 'sup-1', 100000)], () => '<b>Nope</b>');
  assert.match(rows, /&lt;b&gt;Nope&lt;\/b&gt;/);
  assert.doesNotMatch(rows, /<b>Nope<\/b>/);
});

// ---- the address book ------------------------------------------------------

test('an M3 contact wins over the config map, and a broken map is ignored', async () => {
  const withLookup = new ConfigRecipientDirectory({
    source: { COMM_SUPPLIER_EMAILS: '{"sup-1":"stale@config.example"}' },
    lookup: { quoteContact: async () => ({ name: 'Ravi', email: 'ravi@dmc.example' }) },
  });
  assert.equal((await withLookup.supplier('sup-1'))?.email, 'ravi@dmc.example');

  const lookupMisses = new ConfigRecipientDirectory({
    source: { COMM_SUPPLIER_EMAILS: '{"sup-1":"fallback@config.example"}' },
    lookup: { quoteContact: async () => null },
  });
  assert.equal((await lookupMisses.supplier('sup-1'))?.email, 'fallback@config.example');

  const broken = new ConfigRecipientDirectory({ source: { COMM_SUPPLIER_EMAILS: '{not json' } });
  assert.equal(await broken.supplier('sup-1'), null, 'a broken map is an empty directory, not a crash');

  const junk = new ConfigRecipientDirectory({ source: { COMM_SUPPLIER_EMAILS: '{"sup-1":"not-an-address"}' } });
  assert.equal(await junk.supplier('sup-1'), null);
});

test('a lookup that throws falls through to config instead of failing the send', async () => {
  const dir = new ConfigRecipientDirectory({
    source: { COMM_SUPPLIER_EMAILS: '{"sup-1":"fallback@config.example"}' },
    lookup: { quoteContact: async () => { throw new Error('down'); } },
  });
  assert.equal((await dir.supplier('sup-1'))?.email, 'fallback@config.example');
});

// ---- the SMTP provider -----------------------------------------------------

const SMTP_ENV = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_USER: 'connect@elatetrips.example',
  SMTP_PASS: 'secret',
  MAIL_FROM: 'Elate Trips <connect@elatetrips.example>',
};

interface CapturedMail {
  to?: string;
  subject?: string;
  headers?: Record<string, string>;
  text?: string;
}

function fakeTransport(capture: CapturedMail[], fail?: string) {
  return {
    async sendMail(message: CapturedMail): Promise<{ messageId: string }> {
      if (fail) throw new Error(fail);
      capture.push(message);
      return { messageId: '<abc@example>' };
    },
    close(): void {},
  };
}

const sendRequest = (email: string | undefined): SendRequest => ({
  channel: 'email',
  recipient: { recipient_id: 'sup-1', email },
  message: { channel: 'email', subject: 'New RFQ', body: '<p>Hello <a href="https://x.example">card</a></p>' },
  rfq_id: 'rfq-001',
  purpose: 'rfq_dispatch',
});

test('a configured test inbox takes every mail, with the real address kept visible', async () => {
  const capture: CapturedMail[] = [];
  const config = loadSmtpConfig({ ...SMTP_ENV, COMM_TEST_RECIPIENT: 'inbox@example.com' });
  assert.ok(config);
  const provider = new SmtpChannelProvider({
    config,
    transport: fakeTransport(capture) as any,
  });

  const result = await provider.send(sendRequest('real@dmc.example'));
  assert.equal(result.ok, true);
  assert.equal(capture[0].to, 'inbox@example.com');
  assert.match(String(capture[0].subject), /^\[test to real@dmc\.example\] New RFQ$/);
  assert.equal(capture[0].headers?.['X-Elate-Intended-To'], 'real@dmc.example');
  assert.equal(capture[0].headers?.['X-Elate-Rfq-Id'], 'rfq-001');
});

test('with no test inbox the mail goes to the real address, unprefixed', async () => {
  const capture: CapturedMail[] = [];
  const config = loadSmtpConfig(SMTP_ENV);
  assert.ok(config);
  const provider = new SmtpChannelProvider({ config, transport: fakeTransport(capture) as any });

  await provider.send(sendRequest('real@dmc.example'));
  assert.equal(capture[0].to, 'real@dmc.example');
  assert.equal(capture[0].subject, 'New RFQ');
});

test('a transport failure comes back as a result, never as a throw', async () => {
  const config = loadSmtpConfig(SMTP_ENV);
  assert.ok(config);
  const provider = new SmtpChannelProvider({
    config,
    transport: fakeTransport([], 'connection refused') as any,
  });

  const result = await provider.send(sendRequest('real@dmc.example'));
  assert.equal(result.ok, false);
  assert.equal(result.error, 'connection refused');
});

test('a recipient with no address is refused before a socket is opened', async () => {
  const config = loadSmtpConfig(SMTP_ENV);
  assert.ok(config);
  const provider = new SmtpChannelProvider({ config });
  const result = await provider.send(sendRequest(undefined));
  assert.equal(result.ok, false);
  assert.match(String(result.error), /No email address/);
});

test('a partial SMTP config is a misconfiguration, not a degraded mode', () => {
  assert.equal(loadSmtpConfig({ ...SMTP_ENV, SMTP_PASS: undefined }), null);
  assert.equal(loadSmtpConfig({}), null);
  assert.equal(loadSmtpConfig(SMTP_ENV)?.port, 587);
  assert.equal(loadSmtpConfig({ ...SMTP_ENV, SMTP_PORT: 'nonsense' })?.port, 587);
});

test('the plain-text part keeps the link a phone at a trade desk needs', () => {
  const text = htmlToText('<p>Hello</p><p><a href="https://x.example/t">Open the quote card</a></p>');
  assert.match(text, /Open the quote card: https:\/\/x\.example\/t/);
  assert.doesNotMatch(text, /</);
});
