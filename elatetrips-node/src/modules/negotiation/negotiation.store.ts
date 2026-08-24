/**
 * In-memory versioned rule-set store (FR13.4). Every publish appends an immutable
 * RuleSetVersion stamped with actor + timestamp; history is never mutated, so a
 * one-click rollback (FR13.4) is just "publish a copy of version N", leaving the
 * full audit trail intact. Effective dating (FR13.1/13.4) is honoured by
 * `activeAt()`, which resolves the version whose effective window contains a
 * given instant, latest-published winning ties.
 *
 * The store holds only the *technical* mechanism; the rule rows themselves are
 * business data injected via the service (seeded from config, edited via CRUD).
 */
import { NotFoundError } from '../../common/errors/AppError';
import type { NegotiationRule, RuleSetVersion } from './negotiation.types';

export interface PublishInput {
  rules: NegotiationRule[];
  published_by: string;
  effective_from?: string;
  effective_to?: string;
  dry_run_id?: string;
  note?: string;
  rolled_back_from?: number;
}

export class RuleSetStore {
  private readonly versions: RuleSetVersion[] = [];
  private nextVersion = 1;

  /** Append a new immutable version. Returns the stored (frozen) version. */
  publish(input: PublishInput): RuleSetVersion {
    const version: RuleSetVersion = {
      version: this.nextVersion,
      rules: structuredClone(input.rules),
      effective_from: input.effective_from,
      effective_to: input.effective_to,
      published_by: input.published_by,
      published_ts: new Date().toISOString(),
      dry_run_id: input.dry_run_id,
      note: input.note,
      rolled_back_from: input.rolled_back_from,
    };
    this.nextVersion += 1;
    // Freeze so history cannot be rewritten (NFR-1 immutability).
    Object.freeze(version.rules);
    this.versions.push(Object.freeze(version));
    return version;
  }

  list(): readonly RuleSetVersion[] {
    return this.versions.slice();
  }

  get(version: number): RuleSetVersion {
    const found = this.versions.find((v) => v.version === version);
    if (!found) throw new NotFoundError(`Rule set version not found: ${version}`);
    return found;
  }

  /** The latest published version, or undefined when nothing is published yet. */
  latest(): RuleSetVersion | undefined {
    return this.versions.length ? this.versions[this.versions.length - 1] : undefined;
  }

  /**
   * The version effective at `atIso` (default now): among versions whose
   * effective window contains the instant, the one published last wins. A
   * version with no effective_from is always eligible.
   */
  activeAt(atIso?: string): RuleSetVersion | undefined {
    const at = atIso ? new Date(atIso).getTime() : Date.now();
    const eligible = this.versions.filter((v) => {
      if (v.effective_from && at < new Date(v.effective_from).getTime()) return false;
      if (v.effective_to && at > new Date(v.effective_to).getTime()) return false;
      return true;
    });
    if (!eligible.length) return undefined;
    return eligible.reduce((best, v) =>
      new Date(v.published_ts).getTime() >= new Date(best.published_ts).getTime() ? v : best,
    );
  }

  get size(): number {
    return this.versions.length;
  }
}
