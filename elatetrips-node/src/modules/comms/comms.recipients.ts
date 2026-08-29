/**
 * Where an address comes from.
 *
 * THE PROBLEM THIS SOLVES. The frozen contracts carry no addresses. The M3
 * `supplier.schema` view has `comms_consent` but no contacts — deliberately, so
 * a directory read cannot leak them — and `rfq.schema` has no customer block at
 * all. So the dispatcher cannot read an address off the objects it dispatches,
 * and inventing fields would be a contracts change (owner-only, needs a delta).
 *
 * Two sources instead, in order:
 *   1. the M3 supplier record's own quoting contact, via a narrow lookup port
 *      that returns ONLY a name and an address — the PII stays in M3;
 *   2. a config map, for suppliers not yet onboarded into M3.
 *
 * The directory ships empty. With neither source populated every lookup misses
 * and the dispatcher sends nothing, rather than guessing at an address.
 *
 * Config:
 *   COMM_SUPPLIER_EMAILS   JSON map, e.g. {"sup-001":"ops@dmc.example"}
 *   COMM_OPS_EMAIL         the internal trip desk (copied on every wave)
 *   COMM_CUSTOMER_EMAIL    fallback when the submit call carries no address
 */
import type { ConsentFlags, Recipient } from './comms.types';

/** The one thing comms may ask M3 for: how to address a supplier. */
export interface SupplierContactLookup {
  quoteContact(supplier_id: string): Promise<{ name?: string; email?: string } | null>;
}

export interface RecipientDirectory {
  /** A supplier's address, or null when we hold none for that id. */
  supplier(supplier_id: string, consent?: ConsentFlags): Promise<Recipient | null>;
  /** The traveller. `preferred` is the address supplied with the submit call. */
  customer(rfq_id: string, preferred?: string): Recipient | null;
  /** The internal desk, when one is configured. */
  ops(): Recipient | null;
}

export type ConfigSource = Record<string, string | undefined>;

const KEYS = {
  supplierEmails: 'COMM_SUPPLIER_EMAILS',
  opsEmail: 'COMM_OPS_EMAIL',
  customerEmail: 'COMM_CUSTOMER_EMAIL',
} as const;

export const RECIPIENT_CONFIG_KEYS = KEYS;

/** Cheap sanity check. A malformed address is a config error, not a send. */
export function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(value.trim());
}

function readMap(src: ConfigSource, key: string): Record<string, string> {
  const raw = (src[key] ?? '').trim();
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && looksLikeEmail(v)) out[k] = v.trim();
    }
    return out;
  } catch {
    // A broken JSON blob must not take the process down at boot. It surfaces as
    // an empty directory, which the dispatcher reports as "no recipients".
    return {};
  }
}

export interface DirectoryDeps {
  source?: ConfigSource;
  /** M3 supplier contacts. Omitted ⇒ config map only. */
  lookup?: SupplierContactLookup;
}

export class ConfigRecipientDirectory implements RecipientDirectory {
  private readonly supplierEmails: Record<string, string>;
  private readonly opsEmail: string;
  private readonly customerEmail: string;
  private readonly lookup: SupplierContactLookup | undefined;

  constructor(deps: DirectoryDeps = {}) {
    const src: ConfigSource = deps.source ?? process.env;
    this.supplierEmails = readMap(src, KEYS.supplierEmails);
    this.opsEmail = (src[KEYS.opsEmail] ?? '').trim();
    this.customerEmail = (src[KEYS.customerEmail] ?? '').trim();
    this.lookup = deps.lookup;
  }

  async supplier(supplier_id: string, consent?: ConsentFlags): Promise<Recipient | null> {
    let email = '';

    if (this.lookup) {
      // A lookup failure is not a dispatch failure: fall through to config.
      const contact = await this.lookup.quoteContact(supplier_id).catch(() => null);
      if (contact?.email && looksLikeEmail(contact.email)) email = contact.email.trim();
    }
    if (!email) email = this.supplierEmails[supplier_id] ?? '';
    if (!email) return null;

    // The supplier's own consent flags travel with the recipient; CommsService
    // refuses the send when email is not opted in (BR-2). We never default that
    // to true here — the decision belongs to the supplier record, not to us.
    return { recipient_id: supplier_id, email, consent };
  }

  customer(rfq_id: string, preferred?: string): Recipient | null {
    const chosen = preferred?.trim() && looksLikeEmail(preferred) ? preferred.trim() : this.customerEmail;
    if (!chosen || !looksLikeEmail(chosen)) return null;
    // Transactional reply to something the customer just submitted: the consent
    // is the submission itself. Marketing is a different sender identity.
    return { recipient_id: `customer:${rfq_id}`, email: chosen, consent: { email: true } };
  }

  ops(): Recipient | null {
    if (!this.opsEmail || !looksLikeEmail(this.opsEmail)) return null;
    return { recipient_id: 'ops', email: this.opsEmail, consent: { email: true } };
  }
}
