// Explicit maintenance command; ordinary replay never rewrites its trusted bundle.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bundleDirectory, inventory, jsonDigest } from './contracts.mjs';

const [source, commit] = process.argv.slice(2);
if (!source || !/^[a-f0-9]{40}$/.test(commit ?? ''))
  throw new Error('Usage: node snapshot.mjs <frozen-contract-directory> <source-git-commit>');
const mapping = {
  agent: 'agent',
  assignment: 'assignment',
  canonical: 'canonical-package',
  experiences: 'experiences',
  fulfillment: 'fulfillment',
  itinerary: 'itinerary',
  quote: 'quote',
  rfq: 'rfq',
};
const manifest = {
  format: 1,
  digestAlgorithm: 'sha256-canonical-json-sorted-keys-utf8-v1',
  source: {
    repository: 'elatetrips-experiences',
    commit,
    directory: 'contracts',
    releaseLabel: 'not-uniformly-declared; no-adoption-inferred',
  },
  schemas: [],
  fixtures: [],
};
for (const relative of await inventory(source)) {
  if (!relative.endsWith('.json')) continue;
  const value = JSON.parse(await readFile(path.join(source, relative), 'utf8'));
  const schema = relative.endsWith('.schema.json');
  const schemaId = schema
    ? value.$id
    : `https://elatetrips.com/contracts/${mapping[relative.split('/')[1]]}.schema.json`;
  if (typeof schemaId !== 'string' || schemaId.includes('undefined'))
    throw new Error(`No explicit fixture mapping for ${relative}`);
  manifest[schema ? 'schemas' : 'fixtures'].push({
    path: relative,
    sha256: jsonDigest(value),
    schemaId,
  });
  const target = path.join(bundleDirectory, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
await writeFile(
  path.join(bundleDirectory, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);
console.log(
  `Snapshotted ${manifest.schemas.length} schemas and ${manifest.fixtures.length} fixtures; replay separately before accepting.`,
);
