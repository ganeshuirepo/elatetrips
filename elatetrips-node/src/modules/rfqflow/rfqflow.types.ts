/**
 * The ports the dispatcher talks through, and the report it hands back.
 *
 * It depends on none of M3, M4 or the contracts engine directly — three narrow
 * interfaces instead, wired in the composition root. That is what keeps the
 * read-scope rule intact (cross-module knowledge travels through contracts, not
 * imports) and lets the whole workflow be tested with three fakes and no I/O.
 */
import type { Channel, ConsentFlags, Recipient, SendResult } from '../comms/comms.types';
import type { TemplateId } from '../comms/comms.templates';

/** A supplier the wave could go to — M3's candidate row, narrowed. */
export interface DispatchCandidate {
  supplier_id: string;
  name: string;
  declared_tat_hours?: number;
  comms_consent?: ConsentFlags;
  contract_accepted?: boolean;
  /** FR3.10: a material contract bump blocks delivery until re-accepted. */
  reacceptance_required?: boolean;
}

/** M3 — who to ask, in the order M3 wants them asked. */
export interface CandidatePort {
  candidatesFor(destination: string, opts: { track?: string }): Promise<DispatchCandidate[]>;
}

/** The contracts engine — mints the wave's recipient-bound tokens (BR-15). */
export interface WavePort {
  dispatchWave(
    rfq_id: string,
    body: { supplier_ids: string[]; channel: string },
  ): { wave_no: number; links: { supplier_id: string; token: string }[] };
}

/** M3 — a supplier's trading name, for the customer-facing comparison table. */
export interface SupplierNamePort {
  nameFor(supplier_id: string): Promise<string | null>;
}

/** M4 — render a template and transmit it. */
export interface MailPort {
  sendTemplated(input: {
    templateId: TemplateId;
    channel: Channel;
    recipient: Recipient;
    data?: Record<string, unknown>;
    rfq_id?: string;
    mint_link_purpose?: string;
  }): Promise<SendResult>;
}

/** What happened to one recipient. Every outcome is named; none is silent. */
export type SendOutcome =
  | 'sent'
  | 'failed'
  | 'no_address'
  | 'no_consent'
  | 'blocked_reacceptance'
  | 'blocked_contract'
  | 'skipped_cap';

export interface RecipientResult {
  recipient_id: string;
  outcome: SendOutcome;
  detail?: string;
}

export interface DispatchReport {
  rfq_id: string;
  /** Set when the workflow did not run at all (disabled, no destination …). */
  skipped?: string;
  wave_no?: number;
  customer?: RecipientResult;
  ops?: RecipientResult;
  suppliers: RecipientResult[];
}

/** Convenience for logs and tests: how many actually went out. */
export function sentCount(report: DispatchReport): number {
  const rows = [report.customer, report.ops, ...report.suppliers];
  return rows.filter((r) => r?.outcome === 'sent').length;
}
