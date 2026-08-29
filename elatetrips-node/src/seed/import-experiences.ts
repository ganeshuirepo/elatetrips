import { resolve } from 'node:path';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../common/logger';
import { importExperiences } from '../modules/experiences/experiences.import';

/**
 * CLI entry for the Experiences catalog import.
 *
 *   npm run import:experiences -- --dir <path-to>/contracts/fixtures/experiences
 *   npm run import:experiences -- --dir <path> --activate
 *
 * Staged unless `--activate` is passed, so a catalog can be loaded on the real
 * database and inspected before any client sees it.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const dir = arg('dir');
  if (!dir) {
    logger.error('Usage: npm run import:experiences -- --dir <contracts/fixtures/experiences> [--activate]');
    process.exit(1);
  }
  const activate = process.argv.includes('--activate');

  await connectDatabase();
  try {
    const results = await importExperiences(resolve(dir), activate);
    for (const r of results) {
      logger.info(
        `${r.kind}: ${r.inserted ? 'imported' : 'already present'} ${r.checksum.slice(0, 12)}…${r.activated ? ' — ACTIVE' : ' (staged)'}`,
      );
    }
    if (!activate) logger.info('Nothing is served yet. Re-run with --activate to flip it live.');
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err: unknown) => {
  logger.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
