/**
 * Does every route this API actually serves appear in the OpenAPI spec?
 *
 * Reads the real route table off the source — the mount prefixes in
 * routes/index.ts, then every router.<method>('<path>') in the module routers —
 * and diffs it against the spec swagger-jsdoc produces. Anything listed as
 * MISSING is an endpoint a consumer cannot discover from /docs.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import swaggerJsdoc from 'swagger-jsdoc';

const ROOT = process.cwd();

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.routes.ts')) out.push(full);
  }
  return out;
}

// 1. mount prefixes: router.use('/prefix', buildXRouter(...))
const index = readFileSync(join(ROOT, 'src/routes/index.ts'), 'utf8');
const prefixOf = {};
for (const m of index.matchAll(/router\.use\(\s*'([^']*)'\s*,\s*(build\w+)/g)) {
  prefixOf[m[2]] = m[1] === '/' ? '' : m[1];
}

// 2. the real route table
const routes = [];
for (const file of walk(join(ROOT, 'src/modules'))) {
  const src = readFileSync(file, 'utf8');
  const builder = /export function (build\w+)/.exec(src)?.[1];
  const prefix = prefixOf[builder];
  if (prefix === undefined) { console.log('!! unmounted router:', file); continue; }
  for (const m of src.matchAll(/router\.(get|post|patch|put|delete)\(\s*\n?\s*'([^']*)'/g)) {
    const tail = m[2] === '/' ? '' : m[2];
    const path = ('/api/v1' + prefix + tail).replace(/:(\w+)/g, '{$1}');
    routes.push({ method: m[1], path, file: file.replace(ROOT + '\\', '') });
  }
}
routes.push({ method: 'get', path: '/api/v1/health', file: 'src/routes/index.ts' });

// 3. the spec
process.chdir(ROOT);
const spec = swaggerJsdoc({
  definition: { openapi: '3.0.3', info: { title: 'x', version: '1' } },
  apis: ['src/**/*.routes.ts', 'src/routes/*.ts'],
});
const documented = new Set();
for (const [p, ops] of Object.entries(spec.paths ?? {})) {
  for (const method of Object.keys(ops)) documented.add(`${method} ${p}`);
}

// 4. the diff
const missing = routes.filter((r) => !documented.has(`${r.method} ${r.path}`));
const routeKeys = new Set(routes.map((r) => `${r.method} ${r.path}`));
const orphan = [...documented].filter((k) => !routeKeys.has(k));

console.log(`routes served:     ${routes.length}`);
console.log(`spec operations:   ${documented.size}`);
console.log(`MISSING from spec: ${missing.length}`);
for (const r of missing) console.log(`   ${r.method.toUpperCase().padEnd(6)} ${r.path}   (${r.file})`);
console.log(`documented but not served: ${orphan.length}`);
for (const k of orphan) console.log(`   ${k}`);
process.exit(missing.length === 0 ? 0 : 1);
