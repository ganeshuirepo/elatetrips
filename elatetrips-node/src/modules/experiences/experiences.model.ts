import { Schema, model } from 'mongoose';

/**
 * The Experiences catalog, as delivered by the web repo's exporter.
 *
 * WHY A DOCUMENT AND NOT COLLECTIONS. The catalog is authored as a whole in
 * `elatetrips-experiences/src/domain/experiences`, exported as a whole
 * (`npm run export:experiences`), and read as a whole: the call a phone makes on
 * boot is "give me the catalog", once, and cache it. Shredding one authored
 * document into a dozen collections would buy per-entity queries nobody asks
 * for, and cost the one property that matters — that a client either has a
 * complete, self-consistent catalog or has the previous one. A half-applied
 * import is the failure mode worth designing out.
 *
 * Bundles are therefore versioned rows, and exactly one per kind is active.
 * An import lands INACTIVE, so a bad catalog can be inspected before a single
 * client sees it, and yesterday's row stays queryable for rollback.
 */
export type BundleKind = 'catalog' | 'plans';

export interface ExperienceBundleDoc {
  kind: BundleKind;
  /** Shape version from the export (`schemaVersion`), not a content version. */
  schemaVersion: string;
  /** sha256 of the exported file, straight from its manifest. */
  checksum: string;
  /** The exported document, verbatim. Never rewritten on the way in. */
  data: Record<string, unknown>;
  /** Set when this row became the served one; null while staged. */
  activatedAt: Date | null;
  importedAt: Date;
}

const bundleSchema = new Schema<ExperienceBundleDoc>(
  {
    kind: { type: String, required: true, enum: ['catalog', 'plans'], index: true },
    schemaVersion: { type: String, required: true },
    checksum: { type: String, required: true },
    // Mixed: this is a delivered document validated by the exporter's JSON
    // Schema, not a shape this service owns. Re-declaring it here would give
    // two definitions of one contract and let Mongoose silently drop a field
    // the web added — the precise drift the pipeline exists to remove.
    data: { type: Schema.Types.Mixed, required: true },
    activatedAt: { type: Date, default: null },
    importedAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false, collection: 'experience_bundles' },
);

// Re-importing the same bytes is a no-op rather than a second row.
bundleSchema.index({ kind: 1, checksum: 1 }, { unique: true });
// The served lookup: newest active row of a kind.
bundleSchema.index({ kind: 1, activatedAt: -1 });

export const ExperienceBundleModel = model<ExperienceBundleDoc>('ExperienceBundle', bundleSchema);
