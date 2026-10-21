import test from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import { bundleDirectory, inventory, jsonDigest, replayContracts } from './contracts.mjs';
import {
  backendDirectory,
  checkNames,
  lintDiagnostics,
  safeEnvironment,
  verifyAcceptance,
} from './checks.mjs';

async function isolated(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'elate-contract-harness-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(bundleDirectory, directory, { recursive: true });
  return directory;
}
async function mutate(directory, relative, change, rehash = false) {
  const filename = path.join(directory, relative);
  const value = JSON.parse(await readFile(filename, 'utf8'));
  change(value);
  await writeFile(filename, JSON.stringify(value));
  if (rehash)
    await mutate(directory, 'manifest.json', (manifest) => {
      [...manifest.schemas, ...manifest.fixtures].find((entry) => entry.path === relative).sha256 =
        jsonDigest(value);
    });
}
test('all 15 frozen schemas compile and all 20 canonical fixtures replay', async () => {
  const result = await replayContracts();
  assert.equal(result.schemas, 15);
  assert.equal(result.fixtures, 20);
  assert.equal(result.source.commit, 'e8dc98fce0d84f5223a3615f50001f0eb4b29922');
});
test('canonical digest ignores CRLF/format/key order, but preserves value changes', async (t) => {
  const directory = await isolated(t);
  for (const relative of await inventory(directory)) {
    const text = await readFile(path.join(directory, relative), 'utf8');
    await writeFile(path.join(directory, relative), text.replace(/\r?\n/g, '\r\n'));
  }
  assert.equal((await replayContracts(directory)).fixtures, 20);
  assert.equal(jsonDigest({ a: 1, b: 2 }), jsonDigest({ b: 2, a: 1 }));
  assert.notEqual(jsonDigest({ a: 1 }), jsonDigest({ a: 2 }));
});
for (const [name, change] of [
  [
    'missing format',
    (m) => {
      delete m.format;
    },
  ],
  [
    'unknown fields',
    (m) => {
      m.unreviewed = true;
    },
  ],
  [
    'unknown format',
    (m) => {
      m.format = 2;
    },
  ],
  [
    'invalid digest algorithm',
    (m) => {
      m.digestAlgorithm = 'sha1';
    },
  ],
  [
    'invalid source commit',
    (m) => {
      m.source.commit = 'latest';
    },
  ],
  [
    'invented release adoption',
    (m) => {
      m.source.releaseLabel = 'contracts-v1.6';
    },
  ],
  [
    'invalid file checksum',
    (m) => {
      m.fixtures[0].sha256 = 'bad';
    },
  ],
  [
    'duplicate bundle entry',
    (m) => {
      m.fixtures.push(m.fixtures[0]);
    },
  ],
  [
    'unsafe traversal path',
    (m) => {
      m.fixtures[0].path = '../outside.json';
    },
  ],
  [
    'absolute file path',
    (m) => {
      m.fixtures[0].path = 'C:/outside.json';
    },
  ],
  [
    'removed declared fixture',
    (m) => {
      m.fixtures.pop();
    },
  ],
  [
    'fixture without registered schema',
    (m) => {
      m.fixtures[0].schemaId = 'https://elatetrips.com/contracts/missing.schema.json';
    },
  ],
])
  test(`manifest rejects ${name}`, async (t) => {
    const directory = await isolated(t);
    await mutate(directory, 'manifest.json', change);
    await assert.rejects(replayContracts(directory));
  });
test('unmanifested files fail closed', async (t) => {
  const directory = await isolated(t);
  await writeFile(path.join(directory, 'extra.json'), '{}');
  await assert.rejects(replayContracts(directory), /inventory/);
});
test('missing files fail closed', async (t) => {
  const directory = await isolated(t);
  await rm(path.join(directory, 'agent.schema.json'));
  await assert.rejects(replayContracts(directory), /inventory/);
});
test('malformed manifest JSON fails', async (t) => {
  const directory = await isolated(t);
  await writeFile(path.join(directory, 'manifest.json'), '{');
  await assert.rejects(replayContracts(directory), SyntaxError);
});
test('malformed schema JSON fails', async (t) => {
  const directory = await isolated(t);
  await writeFile(path.join(directory, 'agent.schema.json'), '{');
  await assert.rejects(replayContracts(directory), SyntaxError);
});
test('changed fixture fails its hash before schema validation', async (t) => {
  const directory = await isolated(t);
  await mutate(directory, 'fixtures/rfq/rfq-001.json', (v) => {
    v.version = 100;
  });
  await assert.rejects(replayContracts(directory), /digest mismatch/);
});
test('manifest-rehashed invalid payload still fails schema validation', async (t) => {
  const directory = await isolated(t);
  await mutate(
    directory,
    'fixtures/rfq/rfq-001.json',
    (v) => {
      v.version = 'bad';
    },
    true,
  );
  await assert.rejects(replayContracts(directory), /Invalid fixture/);
});
test('date formats are enforced rather than annotations', async (t) => {
  const directory = await isolated(t);
  await mutate(
    directory,
    'fixtures/rfq/rfq-001.json',
    (v) => {
      v.dates.start = '2026-99-99';
    },
    true,
  );
  await assert.rejects(replayContracts(directory), /Invalid fixture/);
});
test('malformed schema keywords fail even after manifest rehash', async (t) => {
  const directory = await isolated(t);
  await mutate(
    directory,
    'agent.schema.json',
    (v) => {
      v.type = 'not-json-schema';
    },
    true,
  );
  await assert.rejects(replayContracts(directory), /schema is invalid/);
});
test('unknown schema keywords fail rather than silently disabling checks', async (t) => {
  const directory = await isolated(t);
  await mutate(
    directory,
    'agent.schema.json',
    (v) => {
      v.typoKeyword = true;
    },
    true,
  );
  await assert.rejects(replayContracts(directory), /unknown keyword/);
});
test('external missing reference fails offline', async (t) => {
  const directory = await isolated(t);
  await mutate(
    directory,
    'agent.schema.json',
    (v) => {
      v.properties.session_id.$ref = 'https://example.invalid/schema.json';
    },
    true,
  );
  await assert.rejects(replayContracts(directory), /resolve reference/);
});
test('invalid local reference fails offline', async (t) => {
  const directory = await isolated(t);
  await mutate(
    directory,
    'agent.schema.json',
    (v) => {
      v.properties.session_id.$ref = '#/$defs/absent';
    },
    true,
  );
  await assert.rejects(replayContracts(directory), /resolve reference/);
});
test('schema identity cannot be silently substituted', async (t) => {
  const directory = await isolated(t);
  await mutate(
    directory,
    'agent.schema.json',
    (v) => {
      v.$id = 'https://example.invalid/other';
    },
    true,
  );
  await assert.rejects(replayContracts(directory), /schema identity/);
});
test('deliberate TypeScript violations produce errors and clean declarations do not', async () => {
  const eslint = new ESLint({ cwd: backendDirectory });
  const [bad] = await eslint.lintText('var unused: any = 1;\nexport const value = unused!;\n', {
    filePath: 'src/harness-lint-probe.ts',
  });
  for (const rule of [
    'no-var',
    '@typescript-eslint/no-explicit-any',
    '@typescript-eslint/no-non-null-assertion',
  ])
    assert.ok(
      bad.messages.some((message) => message.ruleId === rule),
      rule,
    );
  const [unused] = await eslint.lintText('const unused = 1;\nexport {};', {
    filePath: 'src/harness-unused-probe.ts',
  });
  assert.ok(
    unused.messages.some((message) => message.ruleId === '@typescript-eslint/no-unused-vars'),
  );
  const [good] = await eslint.lintText(
    'export interface Directory { load(id: string): Promise<string>; }\n',
    { filePath: 'src/harness-declaration-probe.ts' },
  );
  assert.deepEqual(good.messages, []);
});
test('lint covers every backend TypeScript source/test/declaration file', async () => {
  const eslint = new ESLint({ cwd: backendDirectory });
  const actual = (await eslint.lintFiles(['src/**/*.ts']))
    .map((result) => path.relative(backendDirectory, result.filePath).replaceAll('\\', '/'))
    .sort();
  const expected = (await inventory(path.join(backendDirectory, 'src')))
    .filter((relative) => relative.endsWith('.ts'))
    .map((relative) => `src/${relative}`);
  assert.ok(expected.length > 0);
  assert.deepEqual(actual, expected);
});
test('inline suppressions cannot hide an explicit any violation', async () => {
  const eslint = new ESLint({ cwd: backendDirectory });
  const [result] = await eslint.lintText(
    '/* eslint-disable @typescript-eslint/no-explicit-any */\nexport const value: any = 1;',
    { filePath: 'src/harness-suppression-probe.ts' },
  );
  assert.ok(
    result.messages.some(
      (message) =>
        message.ruleId === '@typescript-eslint/no-explicit-any' && message.severity === 2,
    ),
  );
});
test('the actual lint CLI exits nonzero for a violation and zero for clean TS', () => {
  const args = [
    path.join(backendDirectory, 'node_modules', 'eslint', 'bin', 'eslint.js'),
    '--stdin',
    '--stdin-filename',
    'src/harness-cli-probe.ts',
    '--max-warnings',
    '0',
  ];
  const bad = spawnSync(process.execPath, args, {
    cwd: backendDirectory,
    env: safeEnvironment(),
    input: 'export const value: any = 1;',
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /no-explicit-any/);
  const good = spawnSync(process.execPath, args, {
    cwd: backendDirectory,
    env: safeEnvironment(),
    input: 'export const value = 1;',
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(good.status, 0, good.stderr || good.stdout);
});
test('combined checks include contract, full lint, typecheck, full test and build', () => {
  assert.deepEqual(checkNames, [
    'test:harness',
    'test:contracts',
    'lint',
    'typecheck',
    'test',
    'build',
  ]);
});
test('verification rejects traversal labels and direct unknown npm execution', async () => {
  await assert.rejects(verifyAcceptance('../overwrite'), /evidence label/);
  await assert.rejects(verifyAcceptance('safe', 'arbitrary.exe'), /installed npm CLI/);
});
test('verification strips secrets and runtime injection, fixes only fixture settings', () => {
  const env = safeEnvironment({
    Path: 'fixture-path',
    SystemRoot: 'fixture-windows',
    TEMP: 'fixture-temp',
    NODE_OPTIONS: '--require malicious',
    NODE_PATH: 'bad',
    MONGODB_URI: 'production',
    JWT_SECRET: 'production',
    SMTP_HOST: 'production',
    RANDOM_SECRET: 'private',
    npm_config_registry: 'bad',
  });
  assert.equal(env.Path, 'fixture-path');
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.NODE_PATH, undefined);
  assert.equal(env.RANDOM_SECRET, undefined);
  assert.equal(env.npm_config_registry, undefined);
  assert.equal(env.MONGODB_URI, 'mongodb://127.0.0.1:1/v10-test-disabled');
  assert.equal(env.JWT_SECRET, 'fixture-v10-test-secret-not-production');
  assert.equal(env.SMTP_HOST, '');
  assert.equal(env.MONGOMS_RUNTIME_DOWNLOAD, 'false');
  assert.equal(env.MONGOMS_VERSION, '8.2.6');
});
test('lint evidence separates ownership counts and strips embedded source', () => {
  const report = lintDiagnostics([
    {
      filePath: path.join(backendDirectory, 'src/modules/foundation/example.ts'),
      errorCount: 1,
      warningCount: 0,
      messages: [{ ruleId: 'example' }],
      source: 'private source',
    },
    {
      filePath: path.join(backendDirectory, 'src/legacy.ts'),
      errorCount: 2,
      warningCount: 1,
      messages: [],
    },
  ]);
  assert.deepEqual(report.counts.all, { files: 2, errors: 3, warnings: 1 });
  assert.deepEqual(report.counts.foundation, { files: 1, errors: 1, warnings: 0 });
  assert.deepEqual(report.counts.legacy, { files: 1, errors: 2, warnings: 1 });
  assert.equal(report.diagnostics[0].source, undefined);
});
