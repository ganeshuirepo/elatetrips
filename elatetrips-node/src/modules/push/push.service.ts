import { PushTokenModel } from './push.model';
import type { IPushSender } from './push.sender';
import { supportBus, type SupportEvent } from '../support/support.stream';
import { logger } from '../../common/logger';

interface OrdersPort {
  findByTripId(tripId: string): Promise<{ phone: string } | null>;
}

/**
 * Device push tokens + the send hook (closes mobile-backlog gap #2).
 *
 * Registration is an upsert per device token; the hook subscribes to the
 * existing supportBus emit points, so every milestone/thread/booking mutation
 * that already powers SSE also fans out a push. A mutation emits a burst of
 * events (thread + vendor + ops), so sends coalesce per trip for a moment
 * rather than pinging a guest three times for one tap.
 */
export class PushService {
  private readonly pending = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly orders: OrdersPort,
    private readonly sender: IPushSender,
    /** Coalescing window for a mutation's event burst. */
    private readonly debounceMs = 1500,
  ) {}

  async register(owner: string, scope: 'user' | 'console', token: string, platform: 'android' | 'ios') {
    // A token can migrate between accounts (sign-out → new sign-in) — the
    // upsert re-homes it instead of failing on the unique index.
    await PushTokenModel.updateOne(
      { token },
      { $set: { token, platform, scope, owner }, $setOnInsert: { createdAt: new Date().toISOString() } },
      { upsert: true },
    );
    return { registered: true };
  }

  async unregister(token: string) {
    await PushTokenModel.deleteOne({ token });
    return { removed: true };
  }

  /** Start forwarding support mutations to registered devices. */
  attach(): () => void {
    return supportBus.onEvent((e) => this.onEvent(e));
  }

  private onEvent(e: SupportEvent): void {
    // Guests get pushes about THEIR trip; vendor/ops scopes stay in-app for
    // now (console pushes arrive with the console app's registration).
    if (e.scope !== 'thread' || !e.tripId) return;
    const existing = this.pending.get(e.tripId);
    if (existing) clearTimeout(existing);
    this.pending.set(
      e.tripId,
      setTimeout(() => {
        this.pending.delete(e.tripId);
        void this.notifyTrip(e.tripId).catch((err) =>
          logger.error(`[push] send failed for ${e.tripId}: ${err}`),
        );
      }, this.debounceMs),
    );
  }

  private async notifyTrip(tripId: string): Promise<void> {
    const order = await this.orders.findByTripId(tripId);
    if (!order) return;
    const tokens = await PushTokenModel.find({ scope: 'user', owner: order.phone }).lean();
    await this.sender.send(
      tokens.map((t) => t.token),
      {
        title: `Trip ${tripId}`,
        body: 'There’s an update on your celebration — tap to see.',
        data: { route: `/trips/${tripId}/chat` },
      },
    );
  }
}
