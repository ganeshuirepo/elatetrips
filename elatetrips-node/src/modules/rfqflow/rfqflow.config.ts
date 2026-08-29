/**
 * Dispatch policy (BR-17). Whether the workflow runs at all, how wide a wave
 * goes, how long a supplier is given, and who gets copied are business
 * decisions — every one of them is read here from env, none is a literal in the
 * service.
 *
 * The default is INERT: `RFQFLOW_ENABLED` unset means a customer confirmation
 * changes the RFQ status and sends nothing. A workflow that mails real
 * businesses must be switched on deliberately, per environment.
 */
export type ConfigSource = Record<string, string | undefined>;

export interface RfqFlowConfig {
  /** Master switch. Off ⇒ submit behaves exactly as it did before. */
  enabled: boolean;
  /** Cap on suppliers contacted in the first wave; undefined ⇒ no cap. */
  max_suppliers_per_wave?: number;
  /** What the mail promises as a response window; undefined ⇒ the line is dropped. */
  response_window_hours?: number;
  /** Send the customer their confirmation. */
  notify_customer: boolean;
  /** Copy the internal desk on each dispatch (needs COMM_OPS_EMAIL). */
  copy_ops: boolean;
  /** Restrict the wave to one track (A/B); undefined ⇒ both. */
  track?: string;
  /**
   * Where a quote-card token becomes a clickable address, e.g.
   * `https://www.elatetrips.com/partner/card`. Unset ⇒ the mail carries the
   * bare token, which is useless to a supplier — so this is required in any
   * environment that actually sends.
   */
  link_base?: string;
}

const KEYS = {
  enabled: 'RFQFLOW_ENABLED',
  maxSuppliers: 'RFQFLOW_MAX_SUPPLIERS_PER_WAVE',
  responseWindow: 'RFQFLOW_RESPONSE_WINDOW_HOURS',
  notifyCustomer: 'RFQFLOW_NOTIFY_CUSTOMER',
  copyOps: 'RFQFLOW_COPY_OPS',
  track: 'RFQFLOW_TRACK',
  linkBase: 'RFQFLOW_LINK_BASE',
} as const;

export const RFQFLOW_CONFIG_KEYS = KEYS;

function readBool(src: ConfigSource, key: string, fallback: boolean): boolean {
  const raw = (src[key] ?? '').trim();
  if (!raw) return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

function readInt(src: ConfigSource, key: string): number | undefined {
  const raw = (src[key] ?? '').trim();
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function loadRfqFlowConfig(source?: ConfigSource): RfqFlowConfig {
  const src: ConfigSource = source ?? process.env;
  return {
    enabled: readBool(src, KEYS.enabled, false),
    max_suppliers_per_wave: readInt(src, KEYS.maxSuppliers),
    response_window_hours: readInt(src, KEYS.responseWindow),
    // These two only matter once `enabled` is true, so defaulting them on keeps
    // the switched-on behaviour the obvious one: confirm, and everyone hears.
    notify_customer: readBool(src, KEYS.notifyCustomer, true),
    copy_ops: readBool(src, KEYS.copyOps, true),
    track: (src[KEYS.track] ?? '').trim() || undefined,
    // Trailing slash trimmed here so the join site never has to think about it.
    link_base: (src[KEYS.linkBase] ?? '').trim().replace(/\/+$/, '') || undefined,
  };
}
