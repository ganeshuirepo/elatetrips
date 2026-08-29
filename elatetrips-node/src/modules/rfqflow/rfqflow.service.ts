/**
 * RfqFlowService — what happens the moment a customer confirms.
 *
 * Before this, `POST /rfq/{id}/submit` flipped a status and stopped: somebody
 * then had to notice, open the ops screen, and broadcast by hand. This closes
 * that gap. One confirmation now fans out to every matched supplier and back to
 * the customer, on its own.
 *
 * WHERE IT SITS. It is not in the contracts engine and not in M4. The engine is
 * the frozen surface and must stay synchronous and side-effect-free apart from
 * its audit trail; M4 knows how to send a message but nothing about who should
 * receive an RFQ. This is the orchestration between them, and it reaches both
 * through ports (`rfqflow.types.ts`) so it imports neither.
 *
 * WHAT IT WILL NOT DO. Throw. A confirmation is the customer's action and it has
 * already succeeded by the time we are called — a mail server having a bad
 * afternoon must not turn that into a failed submit. Every failure is captured
 * in the returned report and in M4's delivery log, and the caller decides.
 */
import { logger } from '../../common/logger';
import type { Quote, Rfq } from '../contracts/contracts.types';
import type { RecipientDirectory } from '../comms/comms.recipients';
import type { RfqFlowConfig } from './rfqflow.config';
import {
  datesOf,
  datesShort,
  destinationOf,
  occasionOf,
  paxOf,
  quoteRows,
  searchableDestination,
  windowText,
} from './rfqflow.format';
import type {
  CandidatePort,
  DispatchCandidate,
  DispatchReport,
  MailPort,
  RecipientResult,
  SendOutcome,
  SupplierNamePort,
  WavePort,
} from './rfqflow.types';

export interface RfqFlowDeps {
  config: RfqFlowConfig;
  candidates: CandidatePort;
  wave: WavePort;
  mail: MailPort;
  directory: RecipientDirectory;
  /** Resolves a supplier id to its trading name for the customer's quote table. */
  names?: SupplierNamePort;
  /** Injected clock keeps quote-expiry behaviour deterministic in tests. */
  now?: () => Date;
}

export interface SubmitContext {
  /** Address given with the submit call; overrides the configured fallback. */
  customer_email?: string;
  /** How to greet them. Never sent to a supplier (BR-3). */
  customer_name?: string;
}

export class RfqFlowService {
  private readonly config: RfqFlowConfig;
  private readonly candidates: CandidatePort;
  private readonly wave: WavePort;
  private readonly mail: MailPort;
  private readonly directory: RecipientDirectory;
  private readonly names: SupplierNamePort | undefined;
  private readonly now: () => Date;

  constructor(deps: RfqFlowDeps) {
    this.config = deps.config;
    this.candidates = deps.candidates;
    this.wave = deps.wave;
    this.mail = deps.mail;
    this.directory = deps.directory;
    this.names = deps.names;
    this.now = deps.now ?? ((): Date => new Date());
  }

  /**
   * Has this quote's price stopped holding? An unparseable or absent validity
   * date counts as live: refusing to show a quote because we cannot read its
   * date would hide a real offer over a formatting problem.
   */
  private hasLapsed(quote: Quote): boolean {
    if (!quote.validity_ts) return false;
    const until = new Date(quote.validity_ts).getTime();
    return Number.isFinite(until) && until < this.now().getTime();
  }

  /** Trading name for a supplier id, or null when we cannot resolve one. */
  private async nameFor(supplier_id: string): Promise<string | null> {
    if (!this.names) return null;
    return this.names.nameFor(supplier_id).catch(() => null);
  }

  /**
   * Which candidates may actually be written to, and why the others may not.
   * Each exclusion is recorded rather than filtered away silently — "we mailed
   * two of nine" is only useful next to the seven reasons.
   */
  private screen(all: DispatchCandidate[]): { eligible: DispatchCandidate[]; excluded: RecipientResult[] } {
    const eligible: DispatchCandidate[] = [];
    const excluded: RecipientResult[] = [];

    for (const c of all) {
      let reason: SendOutcome | null = null;
      // FR3.10 — a material contract bump blocks delivery until re-accepted.
      if (c.reacceptance_required) reason = 'blocked_reacceptance';
      else if (c.contract_accepted === false) reason = 'blocked_contract';
      // BR-2 — email is opt-in, and M4 would refuse the send anyway. Catching
      // it here keeps the report honest instead of showing a provider error.
      else if (c.comms_consent?.email !== true) reason = 'no_consent';

      if (reason) excluded.push({ recipient_id: c.supplier_id, outcome: reason });
      else eligible.push(c);
    }

    const cap = this.config.max_suppliers_per_wave;
    if (cap === undefined || eligible.length <= cap) return { eligible, excluded };

    // M3 returns candidates in its own deterministic order (tier → scorecard →
    // fairness debt), so the cap takes a prefix. Re-sorting here would quietly
    // override the fairness rotation M3 exists to run.
    for (const c of eligible.slice(cap)) excluded.push({ recipient_id: c.supplier_id, outcome: 'skipped_cap' });
    return { eligible: eligible.slice(0, cap), excluded };
  }

  /** One send, reduced to a row in the report. Never throws. */
  private async deliver(
    recipient_id: string,
    send: () => Promise<{ ok: boolean; error?: string }>,
  ): Promise<RecipientResult> {
    try {
      const result = await send();
      return result.ok
        ? { recipient_id, outcome: 'sent' }
        : { recipient_id, outcome: 'failed', detail: result.error };
    } catch (err: unknown) {
      // A policy refusal (opt-out, channel disabled) arrives as a thrown
      // AppError from CommsService. That is a legitimate outcome for one
      // recipient, not a reason to abandon the wave.
      return { recipient_id, outcome: 'failed', detail: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * The customer has confirmed. Send them their acknowledgement, then put the
   * RFQ in front of every eligible supplier with a link bound to them (BR-15).
   */
  async onRfqSubmitted(rfq: Rfq, ctx: SubmitContext = {}): Promise<DispatchReport> {
    const report: DispatchReport = { rfq_id: rfq.rfq_id, suppliers: [] };
    if (!this.config.enabled) return { ...report, skipped: 'RFQFLOW_ENABLED is off' };

    const tat = windowText(this.config.response_window_hours);
    const facts = {
      rfq_id: rfq.rfq_id,
      destination: destinationOf(rfq),
      pax: paxOf(rfq),
      dates: datesOf(rfq),
      dates_short: datesShort(rfq),
      occasion: occasionOf(rfq),
      tat,
    };

    // ---- suppliers -----------------------------------------------------
    // Done before the customer mail so the acknowledgement can state a real
    // number. Promising "sent to our partners" when it went to none is the one
    // sentence in this flow the customer can catch us out on.
    const destination = searchableDestination(rfq);
    let eligible: DispatchCandidate[] = [];
    if (destination === null) {
      // `suggest_for_me` with no region: there is nothing to match a supplier
      // on. Ops picks the destination first; this is not a failure.
      report.skipped = 'no destination to match suppliers on';
    } else {
      const found = await this.candidates
        .candidatesFor(destination, { track: this.config.track })
        .catch((err: unknown) => {
          logger.error(`[rfqflow] candidate lookup failed for ${destination}: ${String(err)}`);
          return [] as DispatchCandidate[];
        });
      const screened = this.screen(found);
      eligible = screened.eligible;
      report.suppliers.push(...screened.excluded);
    }

    if (eligible.length > 0) {
      // One mint, one wave.sent audit event, tokens in hand for the links.
      const dispatched = this.wave.dispatchWave(rfq.rfq_id, {
        supplier_ids: eligible.map((c) => c.supplier_id),
        channel: 'email',
      });
      report.wave_no = dispatched.wave_no;
      const tokenFor = new Map(dispatched.links.map((l) => [l.supplier_id, l.token]));

      for (const candidate of eligible) {
        const recipient = await this.directory.supplier(candidate.supplier_id, candidate.comms_consent);
        if (!recipient) {
          report.suppliers.push({ recipient_id: candidate.supplier_id, outcome: 'no_address' });
          continue;
        }
        const token = tokenFor.get(candidate.supplier_id) ?? '';
        const base = this.config.link_base;
        report.suppliers.push(
          await this.deliver(candidate.supplier_id, () =>
            this.mail.sendTemplated({
              templateId: 'rfq_dispatch',
              channel: 'email',
              recipient,
              rfq_id: rfq.rfq_id,
              // The brief a supplier sees carries no traveller identity (BR-3);
              // every field here is trip shape, not who is travelling.
              data: {
                ...facts,
                supplier_name: candidate.name,
                short_link: base ? `${base}/${encodeURIComponent(token)}` : token,
                tat: windowText(candidate.declared_tat_hours ?? this.config.response_window_hours),
              },
            }),
          ),
        );
      }
    }

    const sentTo = report.suppliers.filter((s) => s.outcome === 'sent').length;

    // ---- customer ------------------------------------------------------
    if (this.config.notify_customer) {
      const recipient = this.directory.customer(rfq.rfq_id, ctx.customer_email);
      report.customer = recipient
        ? await this.deliver(recipient.recipient_id, () =>
            this.mail.sendTemplated({
              templateId: 'rfq_ack',
              channel: 'email',
              recipient,
              rfq_id: rfq.rfq_id,
              data: { ...facts, customer_name: ctx.customer_name ?? 'there', supplier_count: sentTo },
            }),
          )
        : { recipient_id: `customer:${rfq.rfq_id}`, outcome: 'no_address' };
    }

    // ---- ops -----------------------------------------------------------
    if (this.config.copy_ops) {
      const desk = this.directory.ops();
      if (desk) {
        report.ops = await this.deliver(desk.recipient_id, () =>
          this.mail.sendTemplated({
            templateId: 'rfq_ack',
            channel: 'email',
            recipient: desk,
            rfq_id: rfq.rfq_id,
            data: { ...facts, customer_name: 'team', supplier_count: sentTo },
          }),
        );
      }
    }

    logger.info(
      `[rfqflow] ${rfq.rfq_id} confirmed → ${sentTo}/${report.suppliers.length} suppliers mailed` +
        `, customer ${report.customer?.outcome ?? 'off'}`,
    );
    return report;
  }

  /**
   * Quotes are in and shortlisted — send the customer the comparison. One mail
   * with everything, not one per quote: the whole value of an RFQ desk is that
   * the customer reads a table instead of an inbox.
   */
  async onQuotesShortlisted(rfq: Rfq, quotes: Quote[], ctx: SubmitContext = {}): Promise<DispatchReport> {
    const report: DispatchReport = { rfq_id: rfq.rfq_id, suppliers: [] };
    if (!this.config.enabled) return { ...report, skipped: 'RFQFLOW_ENABLED is off' };
    if (!this.config.notify_customer) return { ...report, skipped: 'customer notifications are off' };
    if (quotes.length === 0) return { ...report, skipped: 'nothing to compare yet' };

    // Shortlisting ranks on match score and does not check validity, so a
    // lapsed quote can reach this point — and did, the first time this ran end
    // to end. Ranking one internally is harmless; quoting a customer a price
    // that expired last week is not, so the mail drops it. The shortlist API
    // response is untouched: what ops sees is not what we promise a customer.
    const live = quotes.filter((q) => !this.hasLapsed(q));
    if (live.length === 0) return { ...report, skipped: 'every shortlisted quote has expired' };

    const recipient = this.directory.customer(rfq.rfq_id, ctx.customer_email);
    if (!recipient) return { ...report, skipped: 'no customer address' };

    // "sup-014 — INR 84,000" is not a comparison a customer can act on, so the
    // ids are resolved to trading names first. A name we cannot resolve falls
    // back to the id rather than dropping the row: a missing quote in the table
    // is worse than an ugly one.
    const ids = [...new Set(live.map((q) => q.supplier_id))];
    const resolved = await Promise.all(
      ids.map(async (id) => [id, (await this.nameFor(id)) ?? id] as const),
    );
    const names = new Map(resolved);

    report.customer = await this.deliver(recipient.recipient_id, () =>
      this.mail.sendTemplated({
        templateId: 'quote_summary',
        channel: 'email',
        recipient,
        rfq_id: rfq.rfq_id,
        data: {
          rfq_id: rfq.rfq_id,
          destination: destinationOf(rfq),
          customer_name: ctx.customer_name ?? 'there',
          quote_count: live.length,
          quote_rows: quoteRows(live, (id) => names.get(id) ?? id),
        },
      }),
    );
    logger.info(`[rfqflow] ${rfq.rfq_id} quote summary → ${report.customer.outcome}`);
    return report;
  }
}
