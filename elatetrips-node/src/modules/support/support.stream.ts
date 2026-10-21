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

/**
 * Open streams per client address.
 *
 * The endpoint is unauthenticated and each connection costs a socket, a
 * listener and a 25s heartbeat that live until the client goes away — so
 * without a cap, opening connections in a loop is a cheap way to exhaust the
 * process. Generous enough for a person with several tabs and a phone on the
 * same network; far below what a script would want.
 */
const MAX_STREAMS_PER_IP = 12;
const openStreams = new Map<string, number>();

/** Reserve a slot, or refuse. Returns false when this address is at its cap. */
export function claimStreamSlot(ip: string | undefined): boolean {
  const key = ip ?? 'unknown';
  const current = openStreams.get(key) ?? 0;
  if (current >= MAX_STREAMS_PER_IP) return false;
  openStreams.set(key, current + 1);
  return true;
}

/** Give the slot back when the connection closes. */
export function releaseStreamSlot(ip: string | undefined): void {
  const key = ip ?? 'unknown';
  const next = (openStreams.get(key) ?? 1) - 1;
  // Delete at zero rather than leaving a 0 behind, so the map cannot grow
  // without bound across many client addresses.
  if (next <= 0) openStreams.delete(key);
  else openStreams.set(key, next);
}

/** Test seam: current slot count for an address. */
export function openStreamCount(ip: string): number {
  return openStreams.get(ip) ?? 0;
}
