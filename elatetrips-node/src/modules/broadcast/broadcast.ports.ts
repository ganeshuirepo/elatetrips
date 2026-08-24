/**
 * Ports M5 depends on — the ONLY surface through which the broadcast engine
 * reaches M3 (supplier directory) and M4 (comms + magic-link). Defining them as
 * thin interfaces here, and injecting implementations at the composition root
 * (`container.ts`), keeps M5 free of any M3/M4 source import: at integration the
 * stubs below are swapped for adapters over the real modules, one line each.
 *
 * This is the Dependency Inversion Principle: the engine owns the contract, the
 * providers conform to it.
 */
import type { Route, SupplierCandidate, Track } from './broadcast.types';

/** Query for wave candidates — mirrors GET /api/v1/suppliers?destination=&track=. */
export interface SupplierQuery {
  destination: string;
  track: Track;
  /** Restrict to these tiers (e.g. exclude bench until activated). Omit for all. */
  tiers?: SupplierCandidate['tier'][];
}

/**
 * M3 read-API port. `listCandidates` returns tiering + fairness signals applied
 * server-side; `writeFairnessDebt` is the FR5.6 ledger write-back after a wave.
 */
export interface SupplierDirectoryPort {
  listCandidates(query: SupplierQuery): Promise<SupplierCandidate[]>;
  /** Persist a fairness-debt adjustment (skipped ⇒ +1; force-included ⇒ reset). */
  writeFairnessDebt(input: {
    supplier_id: string;
    destination: string;
    track: Track;
    delta: number;
    reset?: boolean;
  }): Promise<void>;
  /** Flip a destination's bench pool on/off (FR5.2a activation/reversion). */
  setBenchActivation(input: { destination: string; track: Track; activate: boolean }): Promise<void>;
}

export interface MagicLink {
  token: string;
  url: string;
  expires_ts: string;
}

export type CommsChannel = 'in_app' | 'email' | 'whatsapp' | 'sms' | 'voice';
export type CommsPurpose =
  | 'rfq_dispatch'
  | 'reminder'
  | 'nudge'
  | 'close_notice'
  | 'bench_activation'
  | 'bench_reversion';

/**
 * M4 send-API port. `mintMagicLink` mints a signed, single-RFQ-scoped,
 * recipient-bound, expiring token (FR4.4 / BR-15); `send` dispatches one message
 * on one channel; `notify` reaches ops/partners for bench state changes.
 */
export interface CommsPort {
  mintMagicLink(input: { rfq_id: string; supplier_id: string }): Promise<MagicLink>;
  send(input: {
    rfq_id: string;
    supplier_id: string;
    channel: CommsChannel;
    purpose: CommsPurpose;
    link?: MagicLink;
    context?: Record<string, unknown>;
  }): Promise<{ delivered: boolean; provider_ref?: string }>;
  notify(input: {
    audience: 'ops' | 'partner';
    purpose: CommsPurpose;
    destination?: string;
    track?: Track;
    supplier_ids?: string[];
    context?: Record<string, unknown>;
  }): Promise<void>;
}

// ---- Stub implementations (wired at container.ts until M3/M4 land) ---------

/**
 * Inert directory stub (BR-17): ships with no partners, so a broadcast against
 * it selects nobody until an operator/adapter provides real candidates. The
 * ledger + bench writes are no-ops recorded in memory for inspection in tests.
 */
export class StubSupplierDirectory implements SupplierDirectoryPort {
  readonly ledgerWrites: { supplier_id: string; delta: number; reset?: boolean }[] = [];
  readonly benchWrites: { destination: string; track: Track; activate: boolean }[] = [];
  private readonly candidates: SupplierCandidate[];

  constructor(seed: SupplierCandidate[] = []) {
    this.candidates = seed;
  }

  listCandidates(query: SupplierQuery): Promise<SupplierCandidate[]> {
    const tiers = query.tiers;
    return Promise.resolve(
      this.candidates.filter(
        (c) =>
          c.track === query.track &&
          c.destinations.includes(query.destination) &&
          (tiers === undefined || tiers.includes(c.tier)),
      ),
    );
  }

  writeFairnessDebt(input: { supplier_id: string; delta: number; reset?: boolean }): Promise<void> {
    this.ledgerWrites.push({ supplier_id: input.supplier_id, delta: input.delta, reset: input.reset });
    return Promise.resolve();
  }

  setBenchActivation(input: { destination: string; track: Track; activate: boolean }): Promise<void> {
    this.benchWrites.push(input);
    return Promise.resolve();
  }
}

/**
 * Comms stub (BR-17): mints deterministic in-memory links and records every
 * send/notify so a simulated-clock test can assert the exact message sequence
 * (FR5 AC) without a live provider.
 */
export class StubComms implements CommsPort {
  readonly sends: {
    rfq_id: string;
    supplier_id: string;
    channel: CommsChannel;
    purpose: CommsPurpose;
  }[] = [];
  readonly notifies: { audience: string; purpose: CommsPurpose; destination?: string }[] = [];
  private seq = 0;

  mintMagicLink(input: { rfq_id: string; supplier_id: string }): Promise<MagicLink> {
    this.seq += 1;
    const token = `tok-${input.rfq_id}-${input.supplier_id}-${this.seq}`;
    return Promise.resolve({
      token,
      url: `link:rfq:${token}`,
      // Expiry is set by M4 config at integration; the stub echoes an open value.
      expires_ts: '',
    });
  }

  send(input: {
    rfq_id: string;
    supplier_id: string;
    channel: CommsChannel;
    purpose: CommsPurpose;
  }): Promise<{ delivered: boolean }> {
    this.sends.push({
      rfq_id: input.rfq_id,
      supplier_id: input.supplier_id,
      channel: input.channel,
      purpose: input.purpose,
    });
    return Promise.resolve({ delivered: true });
  }

  notify(input: { audience: 'ops' | 'partner'; purpose: CommsPurpose; destination?: string }): Promise<void> {
    this.notifies.push({ audience: input.audience, purpose: input.purpose, destination: input.destination });
    return Promise.resolve();
  }
}
