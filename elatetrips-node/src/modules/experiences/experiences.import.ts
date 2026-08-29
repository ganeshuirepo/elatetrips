import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ExperienceBundleModel, type BundleKind } from './experiences.model';

/**
 * Imports an exported Experiences catalog.
 *
 *   npm run import:experiences -- --dir ../../elatetrips-experiences/contracts/fixtures/experiences
 *   npm run import:experiences -- --dir <path> --activate
 *
 * Two properties are worth more than the mechanics:
 *
 *  1. **Verify before write.** Every file is checked against the manifest's
 *     sha256 BEFORE anything is stored. A truncated copy or a hand-edited
 *     bundle is refused whole rather than half-applied.
 *  2. **Staged by default.** Without `--activate` the rows land inactive and no
 *     client sees them, so a catalog can be loaded and inspected on the real
 *     database first. Activation is a separate, instant flip.
 *
 * Re-importing the same bytes is a no-op: the (kind, checksum) index makes that
 * a matter of fact rather than of care.
 */

const FILES: Record<BundleKind, string> = {
  catalog: 'catalog.v1.json',
  plans: 'plans.v1.json',
};

interface ManifestFile {
  sha256: string;
  bytes: number;
}

export interface ImportResult {
  kind: BundleKind;
  checksum: string;
  /** False when this exact bundle was already stored. */
  inserted: boolean;
  activated: boolean;
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Reads and verifies a delivery, throwing before a single write on any mismatch. */
export function readDelivery(dir: string): {
  schemaVersion: string;
  bundles: { kind: BundleKind; checksum: string; data: Record<string, unknown> }[];
} {
  const manifestPath = join(dir, 'manifest.v1.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`No manifest.v1.json in ${dir} — point --dir at contracts/fixtures/experiences`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    schemaVersion?: unknown;
    files?: Record<string, ManifestFile>;
  };
  const schemaVersion = typeof manifest.schemaVersion === 'string' ? manifest.schemaVersion : '';
  if (!schemaVersion) throw new Error('manifest.v1.json has no schemaVersion');

  const bundles: { kind: BundleKind; checksum: string; data: Record<string, unknown> }[] = [];
  for (const [kind, file] of Object.entries(FILES) as [BundleKind, string][]) {
    const path = join(dir, file);
    if (!existsSync(path)) throw new Error(`Missing ${file} in ${dir}`);

    const text = readFileSync(path, 'utf8');
    const expected = manifest.files?.[file];
    if (!expected) throw new Error(`manifest.v1.json does not describe ${file}`);

    const actual = sha256(text);
    if (actual !== expected.sha256) {
      // The whole reason the manifest exists: a bundle that does not match its
      // checksum is not a catalog, it is an accident.
      throw new Error(
        `${file} does not match its manifest checksum (expected ${expected.sha256.slice(0, 12)}…, got ${actual.slice(0, 12)}…). Re-run the export.`,
      );
    }
    if (text.length !== expected.bytes) {
      throw new Error(`${file} is ${text.length} bytes; the manifest says ${expected.bytes}`);
    }

    const data = JSON.parse(text) as Record<string, unknown>;
    if (data.schemaVersion !== schemaVersion) {
      throw new Error(`${file} is schemaVersion ${String(data.schemaVersion)}; the manifest says ${schemaVersion}`);
    }
    bundles.push({ kind, checksum: actual, data });
  }
  return { schemaVersion, bundles };
}

/** Stores a verified delivery. Both bundles land together or not at all. */
export async function importExperiences(dir: string, activate: boolean): Promise<ImportResult[]> {
  const { schemaVersion, bundles } = readDelivery(dir);
  const results: ImportResult[] = [];

  for (const { kind, checksum, data } of bundles) {
    const existing = await ExperienceBundleModel.findOne({ kind, checksum });
    if (!existing) {
      await ExperienceBundleModel.create({
        kind,
        schemaVersion,
        checksum,
        data,
        activatedAt: null,
        importedAt: new Date(),
      });
    }
    results.push({ kind, checksum, inserted: !existing, activated: false });
  }

  if (activate) {
    const at = new Date();
    for (const result of results) {
      // Exactly one active row per kind: retire the rest first, so a failure
      // between the two statements leaves nothing served rather than two.
      await ExperienceBundleModel.updateMany(
        { kind: result.kind, checksum: { $ne: result.checksum } },
        { $set: { activatedAt: null } },
      );
      await ExperienceBundleModel.updateOne(
        { kind: result.kind, checksum: result.checksum },
        { $set: { activatedAt: at } },
      );
      result.activated = true;
    }
  }

  return results;
}
