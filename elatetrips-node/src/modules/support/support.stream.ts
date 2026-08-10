import { EventEmitter } from 'events';

/**
 * The real-time spine: every support mutation emits one event here, and each
 * open SSE connection (guest thread, vendor app, ops console) forwards the
 * events it cares about. In-process only — one node serves all three
 * interfaces today; a broker replaces this emitter if that ever changes.
 */
export interface SupportEvent {
  /** Which booking changed ('' for fleet-wide events like ticket creation). */
  tripId: string;
  /** Who should refetch: guests watch 'thread', vendors 'vendor', ops 'ops'. */
  scope: 'thread' | 'vendor' | 'ops';
  /** The vendor whose task list changed, when scope is 'vendor'. */
  vendorId?: string;
}

class SupportBus extends EventEmitter {
  emitEvent(e: SupportEvent): void {
    this.emit('event', e);
  }
  onEvent(fn: (e: SupportEvent) => void): () => void {
    this.on('event', fn);
    return () => this.off('event', fn);
  }
}

/** More listeners than the default 10: one per open browser tab. */
export const supportBus = new SupportBus();
supportBus.setMaxListeners(200);
