/**
 * M5 broadcast service — orchestration ONLY. It composes the pure wave/bench
 * engine (`broadcast.engine`) with the injected M3/M4 ports and the audit store,
 * holding per-RFQ broadcast state in memory. All decisions live in the engine;
 * all business values in config (BR-17). The service performs I/O (ports),
 * emits audit events (BR-6), and never hard-codes a policy value.
 *
 * The clock is injected (`now`) so the AC's simulated-clock test is fully
 * deterministic.
 */
import { NotFoundError } from '../../common/errors/AppError';
import type { BroadcastConfig } from './broadcast.config';
import { loadBroadcastConfig, type ConfigSource } from './broadcast.config';
import { BroadcastAuditStore } from './broadcast.audit';
import {
  buildCloseNotices,
  decideBenchActivation,
  planLadder,
  selectWaveRecipients,
  shouldStop,
} from './broadcast.engine';
import type { CommsPort, SupplierDirectoryPort } from './broadcast.ports';
import type {
  BenchDecision,
  BenchSignals,
  BroadcastState,
  CloseNotice,
  CloseOutcome,
  Route,
  Track,
  WaveRecord,
} from './broadcast.types';

export interface BroadcastServiceDeps {
  directory: SupplierDirectoryPort;
  comms: CommsPort;
  configSource?: ConfigSource;
  now?: () => Date;
}

export interface DispatchWaveInput {
  rfq_id: string;
  route: Route;
  destination: string;
  track: Track;
  /** Include bench candidates in the pool (set once bench is activated). */
  includeBench?: boolean;
  channel?: string;
}

export interface StopInput {
  rfq_id: string;
  outcome: CloseOutcome;
  winner_supplier_id?: string;
  loss_reasons?: Record<string, string>;
}

export class BroadcastService {
  private readonly directory: SupplierDirectoryPort;
  private readonly comms: CommsPort;
  private readonly config: BroadcastConfig;
  private readonly now: () => Date;
  readonly audit = new BroadcastAuditStore();
  private readonly states = new Map<string, BroadcastState>();

  constructor(deps: BroadcastServiceDeps) {
    this.directory = deps.directory;
    this.comms = deps.comms;
    this.config = loadBroadcastConfig(deps.configSource);
    this.now = deps.now ?? ((): Date => new Date());
  }

  private iso(): string {
    return this.now().toISOString();
  }

  /**
   * FR5.1/FR5.2/FR5.3 — dispatch the next wave for an RFQ. Pulls candidates from
   * M3, selects recipients (route-aware + fairness floor), mints a recipient-
   * bound magic link per recipient and sends the RFQ dispatch via M4, plans each
   * partner's TAT ladder, writes the fairness ledger back to M3 (FR5.6), and
   * emits `wave.sent` (events.md).
   */
  async dispatchWave(input: DispatchWaveInput): Promise<WaveRecord> {
    const state = this.ensureState(input);
    const tiers = input.includeBench
      ? (['primary', 'bench'] as const)
      : (['primary'] as const);
    const candidates = await this.directory.listCandidates({
      destination: input.destination,
      track: input.track,
      tiers: [...tiers],
    });

    const waveNo = state.waves.length + 1;
    const selection = selectWaveRecipients(
      { candidates, route: input.route, waveNo, alreadyContacted: state.contacted },
      this.config,
    );

    const channel = input.channel ?? 'in_app';
    const dispatched_ts = this.iso();
    const tatBySupplier = new Map(candidates.map((c) => [c.supplier_id, c.declared_tat_hours]));
    const ladder = selection.supplier_ids.length
      ? planLadder(tatBySupplier.get(selection.supplier_ids[0]) ?? 0, dispatched_ts, this.config)
      : [];

    for (const supplier_id of selection.supplier_ids) {
      const link = await this.comms.mintMagicLink({ rfq_id: input.rfq_id, supplier_id });
      await this.comms.send({
        rfq_id: input.rfq_id,
        supplier_id,
        channel: 'in_app',
        purpose: 'rfq_dispatch',
        link,
      });
      // Any included partner has their fairness debt reset (FR5.2 / FR5.6).
      await this.directory.writeFairnessDebt({
        supplier_id,
        destination: input.destination,
        track: input.track,
        delta: 0,
        reset: true,
      });
    }
    // Deferred (skipped) partners accrue fairness debt (FR5.2 / FR5.6).
    for (const supplier_id of selection.deferred) {
      await this.directory.writeFairnessDebt({
        supplier_id,
        destination: input.destination,
        track: input.track,
        delta: 1,
      });
    }

    const record: WaveRecord = {
      rfq_id: input.rfq_id,
      wave_no: waveNo,
      supplier_ids: selection.supplier_ids,
      forced_inclusions: selection.forced_inclusions,
      channel,
      dispatched_ts,
      ladder,
    };
    state.waves.push(record);
    state.contacted = [...new Set([...state.contacted, ...selection.supplier_ids])];

    this.audit.append({
      type: 'wave.sent',
      actor: 'system',
      actor_id: 'system',
      role: 'platform',
      subject: { rfq_id: input.rfq_id },
      payload: {
        rfq_id: input.rfq_id,
        wave_no: waveNo,
        supplier_ids: selection.supplier_ids,
        channel,
      },
    });
    return record;
  }

  /**
   * FR5.2a — evaluate + apply bench activation/reversion for a destination+track.
   * The decision is pure (engine); on a change the service flips the pool in M3
   * and notifies ops + affected partners (M4), then audits the transition.
   */
  async evaluateBench(signals: BenchSignals): Promise<BenchDecision> {
    const decision = decideBenchActivation(signals, this.now(), this.config);
    if (!decision.changed) return decision;

    await this.directory.setBenchActivation({
      destination: signals.destination,
      track: signals.track,
      activate: decision.activate,
    });
    await this.comms.notify({
      audience: 'ops',
      purpose: decision.activate ? 'bench_activation' : 'bench_reversion',
      destination: signals.destination,
      track: signals.track,
      context: { triggers: decision.triggers },
    });
    this.audit.append({
      type: decision.activate ? 'bench.activated' : 'bench.reverted',
      actor: 'system',
      actor_id: 'system',
      role: 'platform',
      subject: { destination: signals.destination, track: signals.track },
      before: { activated: signals.currently_activated },
      after: { activated: decision.activate },
      payload: {
        destination: signals.destination,
        track: signals.track,
        triggers: decision.triggers,
      },
    });
    return decision;
  }

  /**
   * FR5.5 — stop conditions. Confirmed/cancelled cancels the broadcast and sends
   * a close notice to every non-winner with a win/loss reason from the configured
   * vocabulary.
   */
  async stop(input: StopInput): Promise<{ notices: CloseNotice[] }> {
    const state = this.requireState(input.rfq_id);
    if (!shouldStop(input.outcome)) return { notices: [] };

    const notices = buildCloseNotices(
      state.contacted,
      input.winner_supplier_id,
      input.loss_reasons ?? {},
      this.config,
    );
    for (const notice of notices) {
      if (notice.won) continue;
      await this.comms.send({
        rfq_id: input.rfq_id,
        supplier_id: notice.supplier_id,
        channel: 'email',
        purpose: 'close_notice',
        context: { loss_reason: notice.loss_reason },
      });
    }
    state.stopped = true;
    state.outcome = input.outcome;
    return { notices };
  }

  getState(rfq_id: string): BroadcastState {
    return this.requireState(rfq_id);
  }

  private ensureState(input: DispatchWaveInput): BroadcastState {
    const existing = this.states.get(input.rfq_id);
    if (existing) return existing;
    const created: BroadcastState = {
      rfq_id: input.rfq_id,
      route: input.route,
      destination: input.destination,
      track: input.track,
      waves: [],
      contacted: [],
      stopped: false,
    };
    this.states.set(input.rfq_id, created);
    return created;
  }

  private requireState(rfq_id: string): BroadcastState {
    const state = this.states.get(rfq_id);
    if (!state) throw new NotFoundError(`No broadcast state for RFQ: ${rfq_id}`);
    return state;
  }
}
