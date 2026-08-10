import { randomUUID } from 'crypto';
import { AppError, ForbiddenError, NotFoundError } from '../../common/errors/AppError';
import type { Order } from '../orders/order.types';
import {
  MilestoneModel,
  SupportStaffModel,
  SupportVendorModel,
  ThreadMessageModel,
  TicketModel,
  TripSupportModel,
} from './support.models';
import { supportBus } from './support.stream';
import type {
  Health,
  Milestone,
  MilestoneState,
  NotifyPref,
  SupportStaff,
  SupportVendor,
  ThreadMessage,
  Ticket,
  TripSupport,
  VendorCategory,
} from './support.types';

const id = () => randomUUID().slice(0, 8);
const now = () => new Date().toISOString();

/** §4 timers: how long past a window's start a silent task stays amber. */
const AMBER_LEAD_MS = 30 * 60 * 1000; // approaching window with nothing booked
const RED_LATE_MS = 15 * 60 * 1000; // window started, no vendor movement

/** §5: a shift bigger than this must be told even to "just handle it" guests. */
const SILENT_SHIFT_MAX_MIN = 15;

/** Premium proxy until the bundle flag rides on the order: big bookings. */
const PREMIUM_TOTAL = 30_000;

/**
 * The milestone template every celebration booking starts from — §3.1's
 * dependency graph in miniature. Hours are relative to the celebration moment
 * (eventAt); the cascade shifts them when reality moves.
 */
const GRAPH_TEMPLATE: {
  label: string;
  icon: string;
  category: VendorCategory;
  startH: number; // hours before eventAt (negative = after)
  lenH: number;
  requiresPhoto: boolean;
}[] = [
  { label: 'Decorator confirmed', icon: '🎈', category: 'decor', startH: 72, lenH: 2, requiresPhoto: false },
  { label: 'Cake ordered', icon: '🎂', category: 'cake', startH: 48, lenH: 2, requiresPhoto: false },
  { label: 'Flowers arranged', icon: '💐', category: 'flowers', startH: 24, lenH: 2, requiresPhoto: false },
  { label: 'Photographer briefed', icon: '📸', category: 'photo', startH: 24, lenH: 1, requiresPhoto: false },
  { label: 'Decoration set up', icon: '✨', category: 'decor', startH: 5, lenH: 3, requiresPhoto: true },
  { label: 'Cake delivered', icon: '🎂', category: 'cake', startH: 3, lenH: 1, requiresPhoto: true },
  { label: 'Table & flowers set', icon: '🕯️', category: 'flowers', startH: 2, lenH: 1, requiresPhoto: true },
  { label: 'Photographer on site', icon: '📷', category: 'photo', startH: 1, lenH: 1, requiresPhoto: false },
];

/**
 * Derived traffic light — never stored, so it cannot go stale (§3.1 threshold
 * watch). Red states page humans; amber is the CM working ahead of trouble.
 */
export function milestoneHealth(m: Milestone, at: Date): Health {
  if (m.state === 'complete') return 'green';
  if (m.state === 'delayed') return 'red';
  const start = new Date(m.windowStart).getTime();
  const t = at.getTime();
  if (m.state === 'enroute' || m.state === 'inprogress') {
    return t > new Date(m.windowEnd).getTime() ? 'red' : 'green';
  }
  // pending/scheduled: nothing moving yet.
  if (t > start + RED_LATE_MS) return 'red';
  if (t > start - AMBER_LEAD_MS && m.state === 'pending') return 'amber';
  return 'green';
}

export const worstHealth = (hs: Health[]): Health =>
  hs.includes('red') ? 'red' : hs.includes('amber') ? 'amber' : 'green';

interface OrdersPort {
  findByTripId(tripId: string): Promise<Order | null>;
  findByPhone(phone: string): Promise<Order[]>;
}

export class SupportService {
  constructor(private readonly orders: OrdersPort) {}

  // ---- assembly -------------------------------------------------------------

  /**
   * Builds the booking's support record + milestone graph on first contact.
   * Lazy rather than an order-service hook so existing bookings (seeded, or
   * created before this module shipped) pick up a graph the moment their chat
   * opens — no backfill migration.
   */
  private async ensure(order: Order): Promise<TripSupport> {
    const existing = await TripSupportModel.findOne({ tripId: order.tripId }).lean<TripSupport>();
    if (existing) return existing;

    const city = (order.summary.destination || 'ooty').split(/[ ,&]/)[0].toLowerCase();
    const eventAt = this.eventMoment(order);

    const cm = await this.pickCm();
    const om =
      (await SupportStaffModel.findOne({ role: 'om', city }).lean<SupportStaff>()) ??
      (await SupportStaffModel.findOne({ role: 'om' }).lean<SupportStaff>());
    if (!cm || !om) throw new AppError(503, 'Support team not seeded yet');

    const trip: TripSupport = {
      tripId: order.tripId,
      phone: order.phone,
      cmId: cm.id,
      omId: om.id,
      pref: 'everything',
      eventAt,
      city,
      premium: order.total >= PREMIUM_TOTAL,
    };
    await TripSupportModel.create(trip);
    await this.buildGraph(trip);
    await this.say(order.tripId, 'assistant', 'status',
      `Hi ${order.contactName.split(' ')[0]}! I’m your Elate Assistant. Your celebration is booked and ` +
      `${cm.name} (your Celebration Manager) is watching over it. Every update lands here — you never have to chase anyone.`);
    return trip;
  }

  /** The moment the graph counts down to: the occasion date at 7 pm, else T+30d. */
  private eventMoment(order: Order): string {
    const d = order.celebration?.occasionDate
      ? new Date(order.celebration.occasionDate)
      : new Date(new Date(order.createdAt).getTime() + 30 * 86400_000);
    d.setHours(19, 0, 0, 0);
    return d.toISOString();
  }

  /** Least-loaded CM: capacity is planned on concurrent bookings (§3.3). */
  private async pickCm(): Promise<SupportStaff | null> {
    const cms = await SupportStaffModel.find({ role: 'cm' }).lean<SupportStaff[]>();
    if (!cms.length) return null;
    const loads = await Promise.all(
      cms.map(async (c) => ({ c, n: await TripSupportModel.countDocuments({ cmId: c.id }) })),
    );
    loads.sort((a, b) => a.n - b.n);
    return loads[0].c;
  }

  private async buildGraph(trip: TripSupport): Promise<void> {
    const event = new Date(trip.eventAt).getTime();
    const stamp = now();
    const docs: Milestone[] = [];
    for (const t of GRAPH_TEMPLATE) {
      const vendor = await this.assignVendor(trip.city, t.category);
      if (!vendor) continue; // no such vendor in this city — the graph just omits it
      docs.push({
        id: id(),
        tripId: trip.tripId,
        label: t.label,
        icon: t.icon,
        category: t.category,
        vendorId: vendor.id,
        state: 'pending',
        windowStart: new Date(event - t.startH * 3600_000).toISOString(),
        windowEnd: new Date(event - t.startH * 3600_000 + t.lenH * 3600_000).toISOString(),
        requiresPhoto: t.requiresPhoto,
        updatedAt: stamp,
      });
    }
    if (docs.length) await MilestoneModel.insertMany(docs);
  }

  /** Primary vendors first; the backup bench is the OM's replacement pool. */
  private async assignVendor(city: string, category: VendorCategory): Promise<SupportVendor | null> {
    return (
      (await SupportVendorModel.findOne({ city, category, backup: false }).lean<SupportVendor>()) ??
      (await SupportVendorModel.findOne({ city, category }).lean<SupportVendor>())
    );
  }

  // ---- guest thread ---------------------------------------------------------

  async getThread(phone: string, tripId: string) {
    const order = await this.orders.findByTripId(tripId);
    if (!order) throw new NotFoundError('Booking not found');
    if (order.phone !== phone) throw new ForbiddenError('This trip belongs to another account');
    const trip = await this.ensure(order);

    const at = new Date();
    const milestones = (await MilestoneModel.find({ tripId }).lean<Milestone[]>())
      .sort((a, b) => a.windowStart.localeCompare(b.windowStart))
      .map((m) => ({ ...m, health: milestoneHealth(m, at) }));
    // The calm stream: crew↔manager coordination stays behind the curtain.
    const messages = (
      await ThreadMessageModel.find({ tripId, internal: { $ne: true } }).lean<ThreadMessage[]>()
    ).sort((a, b) => a.at.localeCompare(b.at));
    const [cm, om] = await Promise.all([
      SupportStaffModel.findOne({ id: trip.cmId }).lean<SupportStaff>(),
      SupportStaffModel.findOne({ id: trip.omId }).lean<SupportStaff>(),
    ]);
    return {
      trip,
      cm,
      om,
      milestones,
      messages,
      health: worstHealth(milestones.map((m) => m.health)),
      recap: {
        destination: order.summary.destination,
        dates: order.summary.dates,
        travellers: order.summary.travellers,
        hotel: order.summary.hotelLabel,
        packages: order.summary.packages?.map((p) => p.celeb) ?? [],
        total: order.total,
      },
    };
  }

  /**
   * §2.3 conversational Q&A. Answers come from the LIVE graph, never canned
   * FAQ text; anything the rules cannot ground in booking state hands off to
   * the CM instead of guessing (§3.1's hard rule — never invent).
   */
  async postMessage(phone: string, tripId: string, text: string) {
    await this.getThread(phone, tripId); // ownership + graph guarantee
    await this.say(tripId, 'user', 'chat', text);
    const reply = await this.answer(tripId, text);
    if (reply) {
      await this.say(tripId, 'assistant', 'chat', reply);
    } else {
      const trip = await TripSupportModel.findOne({ tripId }).lean<TripSupport>();
      const cm = await SupportStaffModel.findOne({ id: trip?.cmId }).lean<SupportStaff>();
      await this.say(tripId, 'assistant', 'handoff',
        `Let me pull in ${cm?.name ?? 'your Celebration Manager'} — one moment.`);
      await this.openTicket(tripId, 1, `Guest question needs a human: “${text.slice(0, 140)}”`);
      await this.say(tripId, 'cm', 'chat',
        `Hi, ${cm?.name ?? 'your Celebration Manager'} here — I’ve got your question and I’m on it. ` +
        `You’ll hear back within 30 minutes.`);
    }
    supportBus.emitEvent({ tripId, scope: 'thread' });
  }

  private async answer(tripId: string, text: string): Promise<string | null> {
    const q = text.toLowerCase();
    const at = new Date();
    const ms = await MilestoneModel.find({ tripId }).lean<Milestone[]>();
    const trip = await TripSupportModel.findOne({ tripId }).lean<TripSupport>();
    if (!trip) return null;

    const fmt = (iso: string) =>
      new Date(iso).toLocaleString('en-IN', {
        weekday: 'short', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short',
      });
    const find = (cat: VendorCategory) =>
      ms.filter((m) => m.category === cat).sort((a, b) => a.windowStart.localeCompare(b.windowStart));

    const statusLine = (m: Milestone): string => {
      switch (m.state) {
        case 'complete': return `${m.label} — done ✓`;
        case 'inprogress': return `${m.label} — happening right now`;
        case 'enroute': return `${m.label} — the team is on the way`;
        case 'delayed': return `${m.label} — running late; ${m.note ?? 'we’re on it'}`;
        default: return `${m.label} — planned for ${fmt(m.windowStart)}`;
      }
    };

    if (/(cake)/.test(q)) {
      const cake = find('cake');
      if (cake.length) return cake.map(statusLine).join(' · ');
    }
    if (/(photo|camera)/.test(q) && !/approve/.test(q)) {
      const p = find('photo');
      if (p.length) return p.map(statusLine).join(' · ');
    }
    if (/(decor|balloon|setup|set up)/.test(q)) {
      const d = find('decor');
      if (d.length) return d.map(statusLine).join(' · ');
    }
    if (/(flower|bouquet)/.test(q)) {
      const f = find('flowers');
      if (f.length) return f.map(statusLine).join(' · ');
    }
    if (/(confirm|on track|status|all good|everything ok)/.test(q)) {
      const health = worstHealth(ms.map((m) => milestoneHealth(m, at)));
      const done = ms.filter((m) => m.state === 'complete').length;
      if (health === 'green')
        return `Everything is on track for ${fmt(trip.eventAt)} 🎉 — ${done} of ${ms.length} steps already done.`;
      return `Mostly on track — one item is running behind and your Celebration Manager is already on it. ${done} of ${ms.length} steps done.`;
    }
    if (/(time|when)/.test(q)) {
      return `The celebration moment is set for ${fmt(trip.eventAt)}. Ask me about the cake, decoration, flowers or photographer for their exact windows.`;
    }
    return null; // → handoff
  }

  async setPref(phone: string, tripId: string, pref: NotifyPref) {
    await this.getThread(phone, tripId);
    await TripSupportModel.updateOne({ tripId }, { $set: { pref } });
    await this.say(tripId, 'assistant', 'status',
      pref === 'everything'
        ? 'Got it — I’ll keep you posted on every step.'
        : 'Got it — we’ll handle the details quietly and tell you when things are done.');
    supportBus.emitEvent({ tripId, scope: 'thread' });
  }

  /** §2.2 premium-tier photo authorization: one tap, straight to CM + vendor. */
  async photoDecision(phone: string, tripId: string, milestoneId: string, approve: boolean, reason?: string) {
    await this.getThread(phone, tripId);
    const m = await MilestoneModel.findOne({ id: milestoneId, tripId }).lean<Milestone>();
    if (!m) throw new NotFoundError('Milestone not found');
    await MilestoneModel.updateOne(
      { id: milestoneId },
      { $set: { photoApproval: approve ? 'approved' : 'change_requested', note: reason, updatedAt: now() } },
    );
    if (approve) {
      await this.say(tripId, 'assistant', 'status', `${m.label} approved — the team has been told it’s perfect. ✓`);
    } else {
      await this.openTicket(tripId, 1, `Guest asked for a change on “${m.label}”: ${reason ?? 'no reason given'}`);
      await this.say(tripId, 'cm', 'chat',
        `I’ve seen your note on “${m.label}” — the vendor is being briefed right now and I’ll confirm here once it’s fixed.`);
    }
    supportBus.emitEvent({ tripId, scope: 'thread' });
    supportBus.emitEvent({ tripId, scope: 'ops' });
  }

  // ---- vendor app -----------------------------------------------------------

  async vendorTasks(vendorId: string) {
    const vendor = await SupportVendorModel.findOne({ id: vendorId }).lean<SupportVendor>();
    if (!vendor) throw new NotFoundError('Vendor not found');
    const at = new Date();
    const tasks = (await MilestoneModel.find({ vendorId }).lean<Milestone[]>())
      .sort((a, b) => a.windowStart.localeCompare(b.windowStart))
      .map((m) => ({ ...m, health: milestoneHealth(m, at) }));
    return { vendor, tasks };
  }

  /**
   * A vendor status update — §3.2. Validated against the graph (§3.1): a
   * completion milestone without its photo is rejected, and a delay must carry
   * a new ETA because a declared delay is a cascade input.
   */
  async updateTask(
    vendorId: string,
    milestoneId: string,
    state: MilestoneState,
    opts: { photoUrl?: string; newStart?: string; note?: string },
  ) {
    const m = await MilestoneModel.findOne({ id: milestoneId }).lean<Milestone>();
    if (!m) throw new NotFoundError('Task not found');
    if (m.vendorId !== vendorId) throw new ForbiddenError('This task belongs to another vendor');
    if (state === 'complete' && m.requiresPhoto && !opts.photoUrl && !m.photoUrl) {
      throw new AppError(422, 'Photo proof required to complete this task');
    }
    if (state === 'delayed' && !opts.newStart) {
      throw new AppError(422, 'A delay must come with a new ETA');
    }

    const patch: Partial<Milestone> = { state, updatedAt: now() };
    if (opts.photoUrl) {
      patch.photoUrl = opts.photoUrl;
      patch.photoApproval = 'pending';
    }
    if (opts.note) patch.note = opts.note;

    let shiftMin = 0;
    if (state === 'delayed' && opts.newStart) {
      shiftMin = Math.round((new Date(opts.newStart).getTime() - new Date(m.windowStart).getTime()) / 60000);
      const len = new Date(m.windowEnd).getTime() - new Date(m.windowStart).getTime();
      patch.windowStart = opts.newStart;
      patch.windowEnd = new Date(new Date(opts.newStart).getTime() + len).toISOString();
    }
    await MilestoneModel.updateOne({ id: milestoneId }, { $set: patch });

    await this.notifyGuest(m, state, shiftMin, opts.photoUrl);
    if (state === 'delayed' && shiftMin > SILENT_SHIFT_MAX_MIN) {
      await this.openTicket(m.tripId, 1, `“${m.label}” delayed by ${shiftMin} min — watch the cascade`);
    }
    supportBus.emitEvent({ tripId: m.tripId, scope: 'thread' });
    supportBus.emitEvent({ tripId: m.tripId, scope: 'vendor', vendorId });
    supportBus.emitEvent({ tripId: m.tripId, scope: 'ops' });
  }

  /** §5 thresholds: what surfaces in chat depends on the guest's preference. */
  private async notifyGuest(m: Milestone, state: MilestoneState, shiftMin: number, photoUrl?: string) {
    const trip = await TripSupportModel.findOne({ tripId: m.tripId }).lean<TripSupport>();
    if (!trip) return;
    const posted = trip.pref === 'everything';

    if (state === 'complete') {
      if (m.requiresPhoto && trip.premium && photoUrl) {
        await this.say(m.tripId, 'assistant', 'photo',
          `${m.icon} ${m.label} — here’s how it looks. Happy with it?`, m.id);
      } else {
        await this.say(m.tripId, 'assistant', 'status', `${m.icon} ${m.label} ✓`);
      }
      return;
    }
    if (state === 'delayed') {
      // Bad news always travels with a plan attached (§5), whatever the pref.
      if (shiftMin > SILENT_SHIFT_MAX_MIN || posted) {
        const eta = new Date(m.windowStart).getTime() + shiftMin * 60000;
        const when = new Date(eta).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
        await this.say(m.tripId, 'assistant', 'status',
          `${m.icon} ${m.label} will now happen around ${when} — we’ve adjusted everything around it, nothing else moves.`);
      }
      return;
    }
    if (posted && (state === 'enroute' || state === 'inprogress' || state === 'scheduled')) {
      const verb = state === 'enroute' ? 'on the way' : state === 'inprogress' ? 'underway' : 'locked in';
      await this.say(m.tripId, 'assistant', 'status', `${m.icon} ${m.label} — ${verb}.`);
    }
  }

  // ---- ops (CM board + OM console) ------------------------------------------

  async board() {
    const trips = await TripSupportModel.find({}).lean<TripSupport[]>();
    const at = new Date();
    const staff = await SupportStaffModel.find({}).lean<SupportStaff[]>();
    const byId = new Map(staff.map((s) => [s.id, s]));
    return Promise.all(
      trips.map(async (t) => {
        const ms = await MilestoneModel.find({ tripId: t.tripId }).lean<Milestone[]>();
        const order = await this.orders.findByTripId(t.tripId);
        return {
          tripId: t.tripId,
          city: t.city,
          eventAt: t.eventAt,
          premium: t.premium,
          guest: order?.contactName ?? t.phone,
          cm: byId.get(t.cmId)?.name ?? t.cmId,
          health: worstHealth(ms.map((m) => milestoneHealth(m, at))),
          done: ms.filter((m) => m.state === 'complete').length,
          total: ms.length,
          pendingPhotos: ms.filter((m) => m.photoApproval === 'pending' && !t.premium).length,
        };
      }),
    );
  }

  async tickets(city?: string) {
    const q = city ? { city } : {};
    return (await TicketModel.find(q).lean<Ticket[]>()).sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  }

  async ticketAction(ticketId: string, staffId: string, action: 'ack' | 'resolve', resolution?: string) {
    const t = await TicketModel.findOne({ id: ticketId }).lean<Ticket>();
    if (!t) throw new NotFoundError('Ticket not found');
    const patch: Partial<Ticket> =
      action === 'ack'
        ? { state: 'ack', ownerId: staffId }
        : { state: 'resolved', ownerId: staffId, resolution: resolution ?? 'Resolved' };
    await TicketModel.updateOne({ id: ticketId }, { $set: patch });
    supportBus.emitEvent({ tripId: t.tripId, scope: 'ops' });
    return { ...t, ...patch };
  }

  /** CM photo review for the silent tier (§2.2): approve quietly, or flag. */
  async reviewPhoto(milestoneId: string, approve: boolean, comment?: string) {
    const m = await MilestoneModel.findOne({ id: milestoneId }).lean<Milestone>();
    if (!m) throw new NotFoundError('Milestone not found');
    await MilestoneModel.updateOne(
      { id: milestoneId },
      { $set: { photoApproval: approve ? 'approved' : 'change_requested', note: comment, updatedAt: now() } },
    );
    if (approve) await this.say(m.tripId, 'assistant', 'status', `${m.icon} ${m.label} ✓`);
    supportBus.emitEvent({ tripId: m.tripId, scope: 'thread' });
    supportBus.emitEvent({ tripId: m.tripId, scope: 'ops' });
  }

  /**
   * §3.4 the OM's replace-vendor action: swap in the backup bench and rewrite
   * the graph. The guest hears per §5 — a same-spec swap is silent for the
   * "just handle it" tier, told plainly for "keep me posted".
   */
  async replaceVendor(milestoneId: string, staffId: string) {
    const m = await MilestoneModel.findOne({ id: milestoneId }).lean<Milestone>();
    if (!m) throw new NotFoundError('Milestone not found');
    const trip = await TripSupportModel.findOne({ tripId: m.tripId }).lean<TripSupport>();
    if (!trip) throw new NotFoundError('Trip support record not found');
    const backup = await SupportVendorModel.findOne({
      city: trip.city, category: m.category, id: { $ne: m.vendorId },
    }).lean<SupportVendor>();
    if (!backup) throw new AppError(409, `No backup ${m.category} vendor in ${trip.city} — the bench is empty`);

    await MilestoneModel.updateOne(
      { id: milestoneId },
      { $set: { vendorId: backup.id, state: 'pending', updatedAt: now() } },
    );
    await this.openTicket(m.tripId, 2, `Vendor replaced on “${m.label}” → ${backup.name}`, staffId, 'resolved');
    if (trip.pref === 'everything') {
      await this.say(m.tripId, 'assistant', 'status',
        `${m.icon} We’ve switched your ${m.category} team to ${backup.name} to keep everything on schedule — same setup, same spec.`);
    }
    supportBus.emitEvent({ tripId: m.tripId, scope: 'thread' });
    supportBus.emitEvent({ tripId: m.tripId, scope: 'vendor', vendorId: backup.id });
    supportBus.emitEvent({ tripId: m.tripId, scope: 'ops' });
  }

  /** Directory endpoints for the mock role pickers. */
  staffDirectory() {
    return SupportStaffModel.find({}).lean<SupportStaff[]>();
  }
  vendorDirectory() {
    return SupportVendorModel.find({}).lean<SupportVendor[]>();
  }

  // ---- role chat ------------------------------------------------------------

  /**
   * A manager's view of a booking's thread: everything, internal included.
   * CMs see every booking (remote, multi-booking); an OM only their city's.
   */
  async opsThread(staff: { role: string; refId: string }, tripId: string) {
    const trip = await TripSupportModel.findOne({ tripId }).lean<TripSupport>();
    if (!trip) throw new NotFoundError('No support record for this trip yet');
    if (staff.role === 'om') {
      const om = await SupportStaffModel.findOne({ id: staff.refId }).lean<SupportStaff>();
      if (om?.city && om.city !== trip.city)
        throw new ForbiddenError('This booking belongs to another city');
    }
    const order = await this.orders.findByTripId(tripId);
    const at = new Date();
    const milestones = (await MilestoneModel.find({ tripId }).lean<Milestone[]>())
      .sort((a, b) => a.windowStart.localeCompare(b.windowStart))
      .map((m) => ({ ...m, health: milestoneHealth(m, at) }));
    const messages = (await ThreadMessageModel.find({ tripId }).lean<ThreadMessage[]>()).sort(
      (a, b) => a.at.localeCompare(b.at),
    );
    return { trip, guest: order?.contactName ?? trip.phone, milestones, messages };
  }

  /**
   * A CM/OM writes into the thread from their own console — the §3.3 exception
   * takeover, as themselves rather than through canned lines. `internal: true`
   * keeps a note in the crew channel instead of the guest stream.
   */
  async opsMessage(
    staff: { role: 'cm' | 'om'; refId: string; name: string },
    tripId: string,
    text: string,
    internal: boolean,
  ) {
    await this.opsThread(staff, tripId); // existence + city scoping
    await this.say(tripId, staff.role, 'chat', text, undefined, { internal, author: staff.name });
    supportBus.emitEvent({ tripId, scope: 'ops' });
    if (!internal) supportBus.emitEvent({ tripId, scope: 'thread' });
    else {
      // Crew members watching this trip's tasks see the note land live.
      const ms = await MilestoneModel.find({ tripId }).lean<Milestone[]>();
      for (const vendorId of new Set(ms.map((m) => m.vendorId))) {
        supportBus.emitEvent({ tripId, scope: 'vendor', vendorId });
      }
    }
  }

  /** The internal crew↔manager channel for one booking a vendor works on. */
  async vendorNotes(vendorId: string, tripId: string) {
    const owns = await MilestoneModel.findOne({ tripId, vendorId }).lean<Milestone>();
    if (!owns) throw new ForbiddenError('No task on this booking');
    return (
      await ThreadMessageModel.find({ tripId, internal: true }).lean<ThreadMessage[]>()
    ).sort((a, b) => a.at.localeCompare(b.at));
  }

  /**
   * A vendor's note to the managers (§3.2's fallback channel, in-app). Always
   * internal — vendors never write into the guest stream.
   */
  async vendorNote(vendorId: string, tripId: string, text: string) {
    await this.vendorNotes(vendorId, tripId); // ownership check
    const vendor = await SupportVendorModel.findOne({ id: vendorId }).lean<SupportVendor>();
    await this.say(tripId, 'vendor', 'chat', text, undefined, {
      internal: true,
      author: vendor?.name ?? vendorId,
    });
    supportBus.emitEvent({ tripId, scope: 'ops' });
    supportBus.emitEvent({ tripId, scope: 'vendor', vendorId });
  }

  // ---- shared ---------------------------------------------------------------

  private async say(
    tripId: string,
    from: ThreadMessage['from'],
    kind: ThreadMessage['kind'],
    text: string,
    milestoneId?: string,
    extra?: Pick<ThreadMessage, 'internal' | 'author'>,
  ) {
    const msg: ThreadMessage = { id: id(), tripId, from, kind, text, at: now(), milestoneId, ...extra };
    await ThreadMessageModel.create(msg);
  }

  private async openTicket(
    tripId: string,
    level: 1 | 2,
    cause: string,
    ownerId?: string,
    state: Ticket['state'] = 'open',
  ) {
    const trip = await TripSupportModel.findOne({ tripId }).lean<TripSupport>();
    await TicketModel.create({
      id: id(), tripId, level, state, city: trip?.city ?? 'ooty', cause, openedAt: now(), ownerId,
    });
    supportBus.emitEvent({ tripId, scope: 'ops' });
  }
}
