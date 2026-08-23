/**
 * In-memory contracts-v1.1 engine — the live host's implementation of every
 * route in `/contracts/api.md`. Additive and self-contained: it touches no
 * existing Mongoose model, so the other apps consuming elatetrips-node keep
 * working unchanged. Seeded from the golden fixtures (spec 006 FR-006-4);
 * directory tables ship empty (BR-17).
 *
 * Each mutating op validates against the schema (422 + ajv paths, never a 500),
 * reads business values from config (BR-17), and appends an audit event (BR-6).
 * Supplier-facing reads are masked (BR-3). Money is integer minor units.
 */
import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '../../common/errors/AppError';
import { AuditStore } from './contract.audit';
import { loadPlatformConfig, type ConfigSource, type PlatformConfig } from './contract.config';
import { assertContract } from './contract.validation';
import { maskEventForSupplier, maskRfqForSupplier, type SupplierRfqView } from './contract.masking';
import type {
  AuditEvent,
  Itinerary,
  Package,
  PackageDelta,
  Poi,
  Policy,
  Quote,
  Rfq,
  RoutePack,
  Supplier,
} from './contracts.types';

import rfq001 from './fixtures/rfq/rfq-001.json';
import rfq002 from './fixtures/rfq/rfq-002-surprise.json';
import rfq003 from './fixtures/rfq/rfq-003-package.json';
import rfq004 from './fixtures/rfq/rfq-004-adventure.json';
import rfq005 from './fixtures/rfq/rfq-005-multi-celebration.json';
import itin001 from './fixtures/itinerary/itin-001.json';
import itin003 from './fixtures/itinerary/itin-003-package.json';
import itin005 from './fixtures/itinerary/itin-005-routepack.json';
import quote001 from './fixtures/quote/quote-001-full.json';
import quoteExpired from './fixtures/quote/quote-expired.json';
import quotePartial from './fixtures/quote/quote-partial.json';

const seedRfqs = [rfq001, rfq002, rfq003, rfq004, rfq005] as unknown as Rfq[];
const seedItineraries = [itin001, itin003, itin005] as unknown as Itinerary[];
const seedQuotes = [quote001, quoteExpired, quotePartial] as unknown as Quote[];

interface LinkToken {
  token: string;
  rfq_id: string;
  supplier_id: string;
  expires_ts: string;
  otp: string;
  otp_attempts: number;
}

export interface EngineOptions {
  configSource?: ConfigSource;
  now?: () => Date;
}

export class ContractsEngine {
  readonly audit = new AuditStore();
  private readonly config: PlatformConfig;
  private readonly now: () => Date;

  private readonly rfqs = new Map<string, Rfq>();
  private readonly itineraries = new Map<string, Itinerary>();
  private readonly quotes = new Map<string, Quote>();
  private readonly suppliers = new Map<string, Supplier>();
  private readonly policies = new Map<string, Policy>();
  private readonly routePacks: RoutePack[] = [];
  private readonly pois: Poi[] = [];
  private readonly packages = new Map<string, Package>();
  private readonly bookings = new Map<string, { booking_id: string; quote_id: string; paymentCaptured: boolean }>();
  private readonly links = new Map<string, LinkToken>();
  private counter = 0;

  constructor(opts: EngineOptions = {}) {
    this.config = loadPlatformConfig(opts.configSource);
    this.now = opts.now ?? ((): Date => new Date());
    for (const r of seedRfqs) this.rfqs.set(r.rfq_id, structuredClone(r));
    for (const i of seedItineraries) this.itineraries.set(i.itinerary_id, structuredClone(i));
    for (const q of seedQuotes) this.quotes.set(q.quote_id, structuredClone(q));
  }

  private id(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter.toString().padStart(3, '0')}`;
  }

  private iso(): string {
    return this.now().toISOString();
  }

  // ---- Intake (M1) ---------------------------------------------------------

  createRfq(body: Partial<Rfq>): Rfq {
    const rfq: Rfq = assertContract('rfq', { ...(body as Rfq), rfq_id: this.id('rfq'), version: 1, status: 'draft' });
    this.rfqs.set(rfq.rfq_id, rfq);
    this.audit.append({
      type: 'rfq.created',
      actor: 'customer',
      actor_id: 'customer',
      role: 'customer',
      subject: { rfq_id: rfq.rfq_id },
      after: { status: rfq.status },
      payload: { rfq_id: rfq.rfq_id, version: rfq.version, 'occasion.type': rfq.occasion.type, package_id: rfq.package_id },
    });
    return rfq;
  }

  patchRfq(rfq_id: string, patch: Partial<Rfq>): Rfq {
    const current = this.requireRfq(rfq_id);
    const next: Rfq = assertContract('rfq', { ...current, ...patch, rfq_id, version: current.version + 1 });
    this.rfqs.set(rfq_id, next);
    this.audit.append({
      type: 'rfq.edited',
      actor: 'customer',
      actor_id: 'customer',
      role: 'customer',
      subject: { rfq_id },
      before: { version: current.version },
      after: { version: next.version },
      payload: { rfq_id, version: next.version, changed_slots: Object.keys(patch) },
    });
    return next;
  }

  submitRfq(rfq_id: string): Rfq {
    const current = this.requireRfq(rfq_id);
    const next: Rfq = assertContract('rfq', { ...current, status: 'submitted' });
    this.rfqs.set(rfq_id, next);
    this.audit.append({
      type: 'rfq.submitted',
      actor: 'customer',
      actor_id: 'customer',
      role: 'customer',
      subject: { rfq_id },
      before: { status: current.status },
      after: { status: next.status },
      payload: { rfq_id, version: next.version },
    });
    return next;
  }

  // ---- Itinerary (M2) ------------------------------------------------------

  buildItinerary(rfq_id: string, body: Partial<Itinerary>): Itinerary {
    this.requireRfq(rfq_id);
    const itinerary: Itinerary = assertContract('itinerary', {
      ...(body as Itinerary),
      itinerary_id: body.itinerary_id ?? this.id('itin'),
      version: 1,
      rfq_id,
      days: body.days ?? [],
    });
    this.itineraries.set(itinerary.itinerary_id, itinerary);
    this.audit.append({
      type: 'itinerary.built',
      actor: 'system',
      actor_id: 'system',
      role: 'platform',
      subject: { rfq_id },
      after: { itinerary_id: itinerary.itinerary_id, version: itinerary.version },
      payload: { itinerary_id: itinerary.itinerary_id, version: itinerary.version, rfq_id, source: body.package_id ? 'package' : 'ai' },
    });
    return itinerary;
  }

  patchItinerary(itinerary_id: string, patch: Partial<Itinerary>): Itinerary {
    const current = this.requireItinerary(itinerary_id);
    const next: Itinerary = assertContract('itinerary', { ...current, ...patch, itinerary_id, version: current.version + 1 });
    this.itineraries.set(itinerary_id, next);
    this.audit.append({
      type: 'itinerary.built',
      actor: 'ops',
      actor_id: 'ops',
      role: 'ops',
      subject: { rfq_id: next.rfq_id },
      before: { version: current.version },
      after: { version: next.version },
      payload: { itinerary_id, version: next.version, rfq_id: next.rfq_id, source: 'ops' },
    });
    return next;
  }

  // ---- Directory (M3/M12) --------------------------------------------------

  listSuppliers(filter: { destination?: string; track?: string } = {}): Supplier[] {
    return Array.from(this.suppliers.values()).filter((s) => {
      if (filter.track && s.track !== filter.track) return false;
      if (filter.destination && !s.destinations.includes(filter.destination)) return false;
      return true;
    });
  }

  // ---- Broadcast (M5) ------------------------------------------------------

  broadcast(rfq_id: string, body: { wave_no?: number; supplier_ids?: string[]; channel?: string }): {
    wave_no: number;
    supplier_ids: string[];
  } {
    this.requireRfq(rfq_id);
    const supplier_ids = body.supplier_ids ?? [];
    const wave_no = body.wave_no ?? 1;
    const channel = body.channel ?? 'in_app';
    for (const supplier_id of supplier_ids) this.mintLink(rfq_id, supplier_id);
    this.audit.append({
      type: 'wave.sent',
      actor: 'ops',
      actor_id: 'ops',
      role: 'ops',
      subject: { rfq_id },
      payload: { rfq_id, wave_no, supplier_ids, channel },
    });
    return { wave_no, supplier_ids };
  }

  // ---- Recipient-bound tokens + OTP (BR-15) --------------------------------

  mintLink(rfq_id: string, supplier_id: string): LinkToken {
    const token = this.id('tok');
    const link: LinkToken = { token, rfq_id, supplier_id, expires_ts: this.iso(), otp: this.id('otp'), otp_attempts: 0 };
    this.links.set(token, link);
    return link;
  }

  private requireLink(token: string): LinkToken {
    const link = this.links.get(token);
    if (!link) throw new NotFoundError('Link not found or expired');
    return link;
  }

  private verifyOtp(link: LinkToken, otp: string | undefined): void {
    link.otp_attempts += 1;
    this.audit.append({
      type: 'link.opened',
      actor: 'supplier',
      actor_id: link.supplier_id,
      role: 'dmc',
      subject: { rfq_id: link.rfq_id },
      payload: { rfq_id: link.rfq_id, supplier_id: link.supplier_id, token_id: link.token, otp_attempt: link.otp_attempts },
    });
    if (!otp || otp !== link.otp) throw new ForbiddenError('OTP verification required');
  }

  // ---- Partner surface (M6) ------------------------------------------------

  getLink(token: string): { rfq: SupplierRfqView; itinerary: Itinerary | null } {
    const link = this.requireLink(token);
    const rfq = this.requireRfq(link.rfq_id);
    this.audit.append({
      type: 'link.opened',
      actor: 'supplier',
      actor_id: link.supplier_id,
      role: 'dmc',
      subject: { rfq_id: link.rfq_id },
      payload: { rfq_id: link.rfq_id, supplier_id: link.supplier_id, token_id: link.token },
    });
    const itinerary = rfq.itinerary_id ? this.itineraries.get(rfq.itinerary_id) ?? null : null;
    return { rfq: maskRfqForSupplier(rfq), itinerary };
  }

  linkQuote(token: string, body: Partial<Quote> & { otp?: string }): Quote {
    const link = this.requireLink(token);
    this.verifyOtp(link, body.otp);
    const quoteBody: Partial<Quote> & { otp?: string } = { ...body };
    delete quoteBody.otp;
    const quote: Quote = assertContract('quote', {
      ...(quoteBody as Quote),
      quote_id: quoteBody.quote_id ?? this.id('q'),
      rfq_id: link.rfq_id,
      supplier_id: link.supplier_id,
      status: 'submitted',
    });
    this.quotes.set(quote.quote_id, quote);
    this.audit.append({
      type: 'quote.submitted',
      actor: 'supplier',
      actor_id: link.supplier_id,
      role: 'dmc',
      subject: { rfq_id: link.rfq_id, quote_id: quote.quote_id },
      after: { status: quote.status },
      payload: { quote_id: quote.quote_id, rfq_id: link.rfq_id, supplier_id: link.supplier_id, total: quote.total, partial: quote.partial },
    });
    return quote;
  }

  linkEnrichment(token: string, body: { quote_id: string; items?: { item: string; media?: string[]; text?: string }[] }): Quote {
    const link = this.requireLink(token);
    const quote = this.requireQuote(body.quote_id);
    const ts = this.iso();
    const responses = (body.items ?? []).map((i) => ({ item: i.item, media: i.media, text: i.text, ts }));
    const next: Quote = assertContract('quote', {
      ...quote,
      enrichment: { ...quote.enrichment, responses: [...(quote.enrichment?.responses ?? []), ...responses] },
    });
    this.quotes.set(next.quote_id, next);
    this.audit.append({
      type: 'enrichment.received',
      actor: 'supplier',
      actor_id: link.supplier_id,
      role: 'dmc',
      subject: { rfq_id: link.rfq_id, quote_id: next.quote_id },
      payload: { quote_id: next.quote_id, items: responses.map((r) => r.item), media_count: responses.reduce((n, r) => n + (r.media?.length ?? 0), 0) },
    });
    return next;
  }

  linkReconfirm(token: string, body: { quote_id: string; otp?: string }): Quote {
    const link = this.requireLink(token);
    this.verifyOtp(link, body.otp);
    const quote = this.requireQuote(body.quote_id);
    const next: Quote = assertContract('quote', { ...quote, status: 'reconfirmed' });
    this.quotes.set(next.quote_id, next);
    this.audit.append({
      type: 'quote.reconfirmed',
      actor: 'supplier',
      actor_id: link.supplier_id,
      role: 'dmc',
      subject: { rfq_id: link.rfq_id, quote_id: next.quote_id },
      payload: { quote_id: next.quote_id, rfq_id: link.rfq_id },
    });
    return next;
  }

  // ---- Quote intelligence (M7) ---------------------------------------------

  listQuotes(rfq_id: string): Quote[] {
    const all = Array.from(this.quotes.values()).filter((q) => q.rfq_id === rfq_id);
    all.sort((a, b) => (b.match_score?.value ?? 0) - (a.match_score?.value ?? 0));
    return this.config.top_n === undefined ? all : all.slice(0, this.config.top_n);
  }

  shortlist(rfq_id: string): Quote[] {
    const ranked = this.listQuotes(rfq_id);
    const capped = this.config.shortlist_cap === undefined ? ranked : ranked.slice(0, this.config.shortlist_cap);
    return capped.map((q, index) => {
      const next: Quote = { ...q, status: 'shortlisted' };
      this.quotes.set(next.quote_id, next);
      this.audit.append({
        type: 'quote.shortlisted',
        actor: 'ops',
        actor_id: 'ops',
        role: 'ops',
        subject: { rfq_id, quote_id: next.quote_id },
        payload: { quote_id: next.quote_id, rfq_id, rank: index + 1 },
      });
      return next;
    });
  }

  negotiate(quote_id: string, body: { by?: 'ai' | 'supplier' | 'ops'; amount: Quote['total']; message?: string }): Quote {
    const quote = this.requireQuote(quote_id);
    const rounds = quote.negotiation?.rounds ?? [];
    const max = this.config.max_negotiation_rounds;
    if (max !== undefined && rounds.length >= max) throw new UnprocessableEntityError('Negotiation round limit reached');
    const by = body.by ?? 'ai';
    const round = { by, amount: body.amount, message: body.message, ts: this.iso() };
    const next: Quote = assertContract('quote', { ...quote, negotiation: { ...quote.negotiation, rounds: [...rounds, round] } });
    this.quotes.set(next.quote_id, next);
    this.audit.append({
      type: 'negotiation.round',
      actor: by === 'supplier' ? 'supplier' : 'ops',
      actor_id: by,
      role: by === 'supplier' ? 'dmc' : 'ops',
      subject: { rfq_id: quote.rfq_id, quote_id },
      payload: { quote_id, by, amount: body.amount, round_no: rounds.length + 1 },
    });
    return next;
  }

  // ---- Booking & fulfilment (M8/M9) ----------------------------------------

  checkout(quote_id: string): { payment_link: string } {
    const quote = this.requireQuote(quote_id);
    const booking_id = this.id('bkg');
    this.bookings.set(booking_id, { booking_id, quote_id, paymentCaptured: false });
    if (quote.policy_id) {
      this.audit.append({
        type: 'policy.snapshotted',
        actor: 'system',
        actor_id: 'system',
        role: 'platform',
        subject: { quote_id, booking_id },
        payload: { booking_id, policy_id: quote.policy_id, version: 1 },
      });
    }
    return { payment_link: `link:pay:${booking_id}` };
  }

  razorpayWebhook(body: { booking_id?: string; quote_id?: string; amount?: Quote['total'] }): { received: true } {
    const booking = body.booking_id ? this.bookings.get(body.booking_id) : undefined;
    if (booking) booking.paymentCaptured = true;
    this.audit.append({
      type: 'payment.captured',
      actor: 'system',
      actor_id: 'system',
      role: 'platform',
      subject: { quote_id: body.quote_id, booking_id: body.booking_id },
      payload: { booking_id: body.booking_id, quote_id: body.quote_id, amount: body.amount },
    });
    return { received: true };
  }

  getFollowups(booking_id: string): { booking_id: string; timeline: { step: string; channel: string; ts: string }[] } {
    const timeline = this.audit
      .bySubject({ booking_id })
      .filter((e) => e.type === 'followup.sent' || e.type === 'followup.completed')
      .map((e) => ({ step: String(e.payload.step ?? ''), channel: String(e.payload.channel ?? ''), ts: e.ts }));
    return { booking_id, timeline };
  }

  // ---- Policy & content (M14/M15/M16) --------------------------------------

  getPolicy(filter: { scope?: string; partner_id?: string } = {}): Policy | null {
    const matches = Array.from(this.policies.values()).filter((p) => {
      if (filter.scope && p.scope !== filter.scope) return false;
      if (filter.partner_id && p.partner_id !== filter.partner_id) return false;
      return true;
    });
    return matches[0] ?? null;
  }

  getRoutePacks(destination?: string): RoutePack[] {
    return destination ? this.routePacks.filter((r) => r.destination === destination) : this.routePacks.slice();
  }

  getPois(destination?: string): Poi[] {
    return destination ? this.pois.filter((p) => p.destination === destination) : this.pois.slice();
  }

  getPackages(filter: { destination?: string; occasion?: string } = {}): Package[] {
    return Array.from(this.packages.values()).filter((p) => {
      if (filter.destination && p.destination !== filter.destination) return false;
      if (filter.occasion && !(p.occasion_tags ?? []).some((t) => t === filter.occasion)) return false;
      return true;
    });
  }

  packageDelta(package_id: string, body: Partial<PackageDelta>): PackageDelta {
    const delta: PackageDelta = assertContract('package-delta', {
      ...(body as PackageDelta),
      delta_id: body.delta_id ?? this.id('delta'),
      package_id,
      changes: body.changes ?? [],
      status: body.status ?? 'draft',
      routed_to_partner_id: body.routed_to_partner_id ?? '',
    });
    return delta;
  }

  // ---- Supplier-facing audit view (BR-3) -----------------------------------

  auditForSupplier(rfq_id: string): AuditEvent[] {
    const booking = Array.from(this.bookings.values()).find((b) => this.quotes.get(b.quote_id)?.rfq_id === rfq_id);
    const paymentCaptured = booking?.paymentCaptured ?? false;
    return this.audit.bySubject({ rfq_id }).map((e) => maskEventForSupplier(e, paymentCaptured));
  }

  // ---- Operator-supplied directory data (BR-17) ----------------------------

  seedSupplier(s: Supplier): void {
    this.suppliers.set(assertContract('supplier', s).supplier_id, s);
  }
  seedPolicy(p: Policy): void {
    this.policies.set(assertContract('policy', p).policy_id, p);
  }
  seedPackage(p: Package): void {
    this.packages.set(assertContract('package', p).package_id, p);
  }
  seedRoutePack(r: RoutePack): void {
    this.routePacks.push(assertContract('route-pack', r));
  }
  seedPoi(p: Poi): void {
    this.pois.push(assertContract('poi', p));
  }

  // ---- lookups -------------------------------------------------------------

  getRfq(rfq_id: string): Rfq | null {
    return this.rfqs.get(rfq_id) ?? null;
  }
  private requireRfq(rfq_id: string): Rfq {
    const rfq = this.rfqs.get(rfq_id);
    if (!rfq) throw new NotFoundError(`RFQ not found: ${rfq_id}`);
    return rfq;
  }
  private requireItinerary(itinerary_id: string): Itinerary {
    const itin = this.itineraries.get(itinerary_id);
    if (!itin) throw new NotFoundError(`Itinerary not found: ${itinerary_id}`);
    return itin;
  }
  private requireQuote(quote_id: string): Quote {
    const quote = this.quotes.get(quote_id);
    if (!quote) throw new NotFoundError(`Quote not found: ${quote_id}`);
    return quote;
  }
}
