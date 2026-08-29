/**
 * Turning an RFQ into the handful of strings a mail template needs. Pure, so it
 * is unit-tested without a mailbox in sight — and separate from the service so
 * the service reads as orchestration and nothing else.
 *
 * Nothing here is a business rule. It is presentation: how a date range, a
 * headcount or a price reads to a human. What we promise about them (the
 * response window, the wave size) is config.
 */
import type { Money, Quote, Rfq } from '../contracts/contracts.types';

/** Anything interpolated into HTML goes through here first. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Where the trip is going. `suggest_for_me` is a real intake mode — the
 * customer has not picked — so it must read as an open question, not an empty
 * slot, and it is also why the caller cannot dispatch on destination alone.
 */
export function destinationOf(rfq: Rfq): string {
  const { mode, place, region_pref } = rfq.destination;
  if (mode === 'place' && place) return place;
  if (region_pref) return `${region_pref} (open to suggestions)`;
  return 'Open — suggestions welcome';
}

/** The destination a supplier search keys off, or null when there is none yet. */
export function searchableDestination(rfq: Rfq): string | null {
  const { mode, place, region_pref } = rfq.destination;
  if (mode === 'place' && place) return place;
  return region_pref ?? null;
}

/** "4 adults + 2 children" — the shape an operator prices against. */
export function paxOf(rfq: Rfq): string {
  const adults = rfq.travellers.adults;
  const kids = rfq.travellers.kids.length;
  const a = `${adults} adult${adults === 1 ? '' : 's'}`;
  if (kids === 0) return a;
  return `${a} + ${kids} child${kids === 1 ? '' : 'ren'}`;
}

export function paxCount(rfq: Rfq): number {
  return rfq.travellers.adults + rfq.travellers.kids.length;
}

/** "12 Nov 2026 to 16 Nov 2026 (±2 days)", degrading as slots go missing. */
export function datesOf(rfq: Rfq): string {
  const { start, end, flex_days } = rfq.dates;
  const flex = flex_days > 0 ? ` (±${flex_days} day${flex_days === 1 ? '' : 's'})` : '';
  if (start && end) return `${day(start)} to ${day(end)}${flex}`;
  if (start) return `from ${day(start)}${flex}`;
  return `dates flexible${flex_days > 0 ? ` (±${flex_days} days)` : ''}`;
}

/**
 * The date range for a SUBJECT LINE: "11–15 Oct 2026". `datesOf` is the body
 * version and carries the flex window in brackets; nesting that inside a
 * subject that already has brackets reads as a bug, which is how this got its
 * own function.
 */
export function datesShort(rfq: Rfq): string {
  const { start, end } = rfq.dates;
  if (!start) return 'dates flexible';
  if (!end) return day(start);

  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return `${day(start)} to ${day(end)}`;

  const part = (d: Date, opts: Intl.DateTimeFormatOptions): string =>
    d.toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
  const sameMonth = part(s, { month: 'short', year: 'numeric' }) === part(e, { month: 'short', year: 'numeric' });
  return sameMonth
    ? `${part(s, { day: 'numeric' })}–${part(e, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `${part(s, { day: 'numeric', month: 'short' })} – ${part(e, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** ISO day → "12 Nov 2026". Falls back to the raw value if it will not parse. */
function day(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** "Celebration — anniversary, milestone birthday" when we know the detail. */
export function occasionOf(rfq: Rfq): string {
  const type = rfq.occasion.type;
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  const celebrations = rfq.occasion.details?.celebrations ?? [];
  const kinds: string[] = celebrations.map((c) => c.kind).filter((k) => typeof k === 'string' && k.length > 0);
  return kinds.length ? `${label} — ${kinds.join(', ')}` : label;
}

/** "within 24 hours" / "within 2 days". Empty when no window is configured. */
export function windowText(hours: number | undefined): string {
  if (hours === undefined) return 'as soon as you can';
  if (hours < 48) return `${hours} hours`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Money is stored in integer MINOR units (NFR), so this is the ONE place that
 * divides by 100. A price rendered straight from the field is off by two orders
 * of magnitude, and it looks plausible enough to reach a customer.
 */
export function moneyText(money: Money | undefined): string {
  if (!money) return '—';
  const major = money.amount / 100;
  return `${money.currency} ${major.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/** The comparison table in the customer's quote mail. */
export function quoteRows(quotes: Quote[], nameFor: (supplier_id: string) => string): string {
  if (quotes.length === 0) return '<p>No quotes yet.</p>';
  const cells = quotes
    .map((q) => {
      const name = escapeHtml(nameFor(q.supplier_id));
      const total = escapeHtml(moneyText(q.total));
      const valid = escapeHtml(q.validity_ts ? day(q.validity_ts) : '—');
      const note = q.partial ? ' <span style="color:#a4703a">(partial)</span>' : '';
      return (
        '<tr>' +
        `<td style="padding:8px 12px 8px 0;border-top:1px solid #e6ebea">${name}${note}</td>` +
        `<td style="padding:8px 12px 8px 0;border-top:1px solid #e6ebea;font-weight:700">${total}</td>` +
        `<td style="padding:8px 0;border-top:1px solid #e6ebea;color:#7b8b89">holds to ${valid}</td>` +
        '</tr>'
      );
    })
    .join('');
  return `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:18px 0">${cells}</table>`;
}
