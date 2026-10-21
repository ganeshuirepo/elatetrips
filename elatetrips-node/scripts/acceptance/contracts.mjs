import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const bundleDirectory = fileURLToPath(new URL('./frozen/', import.meta.url));
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
export function jsonDigest(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
export async function inventory(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory())
      result.push(...(await inventory(path.join(directory, entry.name), `${relative}/`)));
    else if (entry.isFile()) result.push(relative);
    else throw new Error(`Unsupported bundle entry: ${relative}`);
  }
  return result.sort();
}
const fileEntry = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'sha256'],
  properties: {
    path: { type: 'string', pattern: '^[a-z0-9][a-z0-9./-]*\\.json$' },
    sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    schemaId: { type: 'string', pattern: '^https://elatetrips\\.com/contracts/' },
  },
};
const manifestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['format', 'digestAlgorithm', 'source', 'schemas', 'fixtures'],
  properties: {
    format: { const: 1 },
    digestAlgorithm: { const: 'sha256-canonical-json-sorted-keys-utf8-v1' },
    source: {
      type: 'object',
      additionalProperties: false,
      required: ['repository', 'commit', 'directory', 'releaseLabel'],
      properties: {
        repository: { const: 'elatetrips-experiences' },
        commit: { type: 'string', pattern: '^[a-f0-9]{40}$' },
        directory: { const: 'contracts' },
        releaseLabel: { const: 'not-uniformly-declared; no-adoption-inferred' },
      },
    },
    schemas: {
      type: 'array',
      minItems: 1,
      items: { ...fileEntry, required: ['path', 'sha256', 'schemaId'] },
    },
    fixtures: {
      type: 'array',
      minItems: 1,
      items: { ...fileEntry, required: ['path', 'sha256', 'schemaId'] },
    },
  },
};
function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: true });
  addFormats(ajv);
  return ajv;
}
export async function replayContracts(directory = bundleDirectory) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  const manifestValidator = validator().compile(manifestSchema);
  if (!manifestValidator(manifest))
    throw new Error(`Invalid bundle manifest: ${JSON.stringify(manifestValidator.errors)}`);
  const entries = [...manifest.schemas, ...manifest.fixtures];
  const names = entries.map((entry) => entry.path);
  if (names.some((name) => name.split('/').includes('..')) || new Set(names).size !== names.length)
    throw new Error('Unsafe or duplicate bundle paths');
  const expected = [...names, 'manifest.json'].sort();
  if (JSON.stringify(expected) !== JSON.stringify(await inventory(directory)))
    throw new Error('Bundle inventory differs from manifest');
  const documents = new Map();
  for (const entry of entries) {
    const document = JSON.parse(await readFile(path.join(directory, entry.path), 'utf8'));
    if (jsonDigest(document) !== entry.sha256)
      throw new Error(`Bundle digest mismatch: ${entry.path}`);
    documents.set(entry.path, document);
  }
  const ajv = validator();
  const ids = new Set();
  for (const entry of manifest.schemas) {
    const schema = documents.get(entry.path);
    if (
      !entry.path.endsWith('.schema.json') ||
      schema.$id !== entry.schemaId ||
      schema.$schema !== 'https://json-schema.org/draft/2020-12/schema' ||
      ids.has(schema.$id)
    )
      throw new Error(`Invalid schema identity: ${entry.path}`);
    ids.add(schema.$id);
    ajv.addSchema(schema);
  }
  // Compile every schema, including those without a golden fixture. No async
  // loader is supplied, so missing/external references fail without networking.
  for (const id of ids) if (!ajv.getSchema(id)) throw new Error(`Schema not compiled: ${id}`);
  for (const entry of manifest.fixtures) {
    if (!entry.path.startsWith('fixtures/') || !ids.has(entry.schemaId))
      throw new Error(`Unknown fixture schema: ${entry.path}`);
    const validate = ajv.getSchema(entry.schemaId);
    if (!validate(documents.get(entry.path)))
      throw new Error(`Invalid fixture ${entry.path}: ${JSON.stringify(validate.errors)}`);
  }
  return {
    schemas: manifest.schemas.length,
    fixtures: manifest.fixtures.length,
    source: manifest.source,
    digestAlgorithm: manifest.digestAlgorithm,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  replayContracts()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
