import { createHash } from 'node:crypto';
import { ExperienceBundleModel, type BundleKind } from './experiences.model';
import { NotFoundError } from '../../common/errors/AppError';

/**
 * Serves the Experiences catalog imported from the web repo's export.
 *
 * The service reads; it never edits the delivered documents. Anything that
 * reshapes a bundle here would be a second author of the catalog, and the whole
 * point of the pipeline is that there is exactly one.
 *
 * The convenience endpoints (occasions, sections, a single plan) are PROJECTIONS
 * of the two active bundles, not separate stores — so they cannot disagree with
 * `/bundle`, and a client that has the bundle already needs none of them.
 */

/** What a client caches and revalidates against. */
export interface CatalogVersion {
  schemaVersion: string;
  /** Identifies the exact bytes served — the ETag, without quotes. */
  revision: string;
  activatedAt: Date | null;
}

export interface CatalogBundle extends CatalogVersion {
  catalog: Record<string, unknown>;
  plans: Record<string, unknown>;
}

type Json = Record<string, unknown>;

/** Narrow an unknown property to a record without an `any` in sight. */
function record(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export class ExperiencesService {
  /** The active row of a kind, newest first. Staged imports are invisible here. */
  private async active(kind: BundleKind) {
    const doc = await ExperienceBundleModel.findOne({ kind, activatedAt: { $ne: null } })
      .sort({ activatedAt: -1 })
      .lean();
    if (!doc) {
      throw new NotFoundError(
        `No active experiences ${kind} bundle. Import one: npm run import:experiences -- --dir <contracts/fixtures/experiences> --activate`,
      );
    }
    return doc;
  }

  /**
   * One revision covering BOTH bundles: they are exported together and are only
   * self-consistent together, so a client must never hold a new catalog beside
   * yesterday's plans. Hashing the two checksums gives one value that changes if
   * either does.
   */
  async version(): Promise<CatalogVersion> {
    const [catalog, plans] = await Promise.all([this.active('catalog'), this.active('plans')]);
    const revision = createHash('sha256')
      .update(`${catalog.checksum}:${plans.checksum}`)
      .digest('hex')
      .slice(0, 32);
    const activatedAt =
      catalog.activatedAt && plans.activatedAt
        ? new Date(Math.max(catalog.activatedAt.getTime(), plans.activatedAt.getTime()))
        : null;
    return { schemaVersion: catalog.schemaVersion, revision, activatedAt };
  }

  /** Everything, in one document — the call the app makes on boot. */
  async bundle(): Promise<CatalogBundle> {
    const [catalog, plans, version] = await Promise.all([
      this.active('catalog'),
      this.active('plans'),
      this.version(),
    ]);
    return { ...version, catalog: catalog.data, plans: plans.data };
  }

  async catalog(): Promise<Json> {
    return (await this.active('catalog')).data;
  }

  async plans(): Promise<Json> {
    return (await this.active('plans')).data;
  }

  /** Occasion tiles, optionally for one classification. */
  async occasions(classification?: string): Promise<unknown[]> {
    const occasions = record((await this.catalog()).occasions) ?? {};
    if (classification) return list(occasions[classification]);
    return Object.values(occasions).flatMap((v) => list(v));
  }

  /** Festivals whose window intersects [from, to]; unbounded when omitted. */
  async festivals(from?: string, to?: string): Promise<unknown[]> {
    const all = list((await this.catalog()).festivals);
    if (!from && !to) return all;
    return all.filter((f) => {
      const fest = record(f);
      const start = typeof fest?.start === 'string' ? fest.start : '';
      const end = typeof fest?.end === 'string' ? fest.end : start;
      // Intersection, not containment: a festival already running when the
      // window opens is exactly the one a traveller is searching for.
      if (from && end < from) return false;
      if (to && start > to) return false;
      return true;
    });
  }

  async destinations(): Promise<{ destinations: unknown[]; routes: unknown[] }> {
    const catalog = await this.catalog();
    return { destinations: list(catalog.destinations), routes: list(catalog.routes) };
  }

  async sections(classification?: string): Promise<unknown> {
    const sections = record((await this.plans()).sections) ?? {};
    return classification ? list(sections[classification]) : sections;
  }

  async addons(classification?: string): Promise<unknown> {
    const addons = record((await this.plans()).addons) ?? {};
    return classification ? list(addons[classification]) : addons;
  }

  async transport(): Promise<unknown> {
    return (await this.plans()).transport ?? null;
  }

  /**
   * The fixed day plan for an occasion. Returns null rather than 404 when an
   * occasion has none: a trip with no scripted plan is ordinary, and the caller
   * falls back to its own generator (web `itineraryFor()`).
   */
  async plan(occasion: string): Promise<unknown | null> {
    const plans = record((await this.plans()).occasionPlans) ?? {};
    return plans[occasion] ?? null;
  }
}
