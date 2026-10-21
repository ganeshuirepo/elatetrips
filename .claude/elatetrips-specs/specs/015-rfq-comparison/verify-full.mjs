// Feature-owned retained verification: never writes a prior feature's evidence.
import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const specDirectory = fileURLToPath(new URL('./', import.meta.url));
const backendDirectory = path.resolve(specDirectory, '../../../../elatetrips-node');
const worktreeDirectory = path.dirname(backendDirectory);
const label = process.argv[2];
if (!/^[a-z][a-z0-9-]{0,50}$/.test(label ?? '')) throw new Error('Supply a unique evidence label');
const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const allow = new Set([
  'path',
  'systemroot',
  'windir',
  'comspec',
  'pathext',
  'temp',
  'tmp',
  'userprofile',
  'homedrive',
  'homepath',
  'appdata',
  'localappdata',
  'programfiles',
  'programfiles(x86)',
  'programdata',
  'number_of_processors',
  'processor_architecture',
]);
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => allow.has(name.toLowerCase())),
);
Object.assign(environment, {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:1/v10-test-disabled',
  JWT_SECRET: 'fixture-v10-test-secret-not-production',
  ADMIN_KEY: 'fixture-v10-admin-not-production',
  BREVO_API_KEY: '',
  TWILIO_ACCOUNT_SID: '',
  TWILIO_AUTH_TOKEN: '',
  FAST2SMS_API_KEY: '',
  SMTP_HOST: '',
  SMTP_USER: '',
  SMTP_PASSWORD: '',
  SMTP_PASS: '',
  MONGOMS_SYSTEM_BINARY: path.join(
    worktreeDirectory,
    '.claude/.cache/014-acceptance/mongod-x64-win32-8.2.6.exe',
  ),
  MONGOMS_VERSION: '8.2.6',
  MONGOMS_RUNTIME_DOWNLOAD: 'false',
  npm_config_cache: path.join(worktreeDirectory, '.claude/.cache/015-rfq/npm'),
  npm_config_ignore_scripts: 'true',
  npm_config_update_notifier: 'false',
});
const directory = path.join(specDirectory, 'evidence', label);
await mkdir(path.dirname(directory), { recursive: true });
await mkdir(directory); // Refuse overwriting historical evidence.
const report = {
  format: 1,
  commit: execFileSync(
    'git',
    ['-c', `safe.directory=${worktreeDirectory.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'],
    { cwd: worktreeDirectory, env: environment, encoding: 'utf8', windowsHide: true },
  ).trim(),
  startedAt: new Date().toISOString(),
  node: process.version,
  environment:
    'OS allowlist plus fixture-only overrides; no ambient application secrets/runtime injection',
  checks: [],
};
const commands = [
  [
    'lint-rfq',
    ['node_modules/eslint/bin/eslint.js', 'src/modules/rfqflow/**/*.ts', '--max-warnings', '0'],
  ],
  ['test-rfq', ['-r', './scripts/register-ts.js', '--test', 'src/modules/rfqflow/rfqflow.test.ts']],
  ...['test:harness', 'test:contracts', 'lint', 'typecheck', 'test', 'build'].map((name) => [
    name,
    [npmCli, 'run', name],
  ]),
];
for (const [name, args] of commands) {
  if (name === 'lint')
    args.push('--', '--format', 'json', '--output-file', path.join(directory, 'lint.json'));
  const filename = name.replaceAll(':', '-');
  const output = createWriteStream(path.join(directory, `${filename}.stdout.txt`));
  const errors = createWriteStream(path.join(directory, `${filename}.stderr.txt`));
  const startedAt = new Date().toISOString();
  const child = spawn(process.execPath, args, {
    cwd: backendDirectory,
    env: environment,
    windowsHide: true,
    shell: false,
  });
  child.stdout.pipe(output);
  child.stderr.pipe(errors);
  const result = await new Promise((resolve) => {
    child.once('error', (error) =>
      resolve({ exitCode: null, signal: null, launchError: error.message }),
    );
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
  });
  await Promise.all([finished(output), finished(errors)]);
  if (name === 'lint') {
    // Keep diagnostics, never whole source strings from unrelated modules.
    const lintFile = path.join(directory, 'lint.json');
    try {
      const results = JSON.parse(await readFile(lintFile, 'utf8'));
      await writeFile(
        lintFile,
        `${JSON.stringify(
          results.map(({ filePath, errorCount, warningCount, messages }) => ({
            file: path.relative(backendDirectory, filePath).replaceAll('\\', '/'),
            errorCount,
            warningCount,
            messages,
          })),
          null,
          2,
        )}\n`,
      );
    } catch (error) {
      result.diagnosticReportError = error.message;
    }
  }
  report.checks.push({
    name,
    command: [process.execPath, ...args],
    startedAt,
    completedAt: new Date().toISOString(),
    ...result,
  });
  await writeFile(path.join(directory, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${name}: ${result.exitCode ?? result.launchError ?? result.signal}`);
}
report.completedAt = new Date().toISOString();
report.passed = report.checks.every((check) => check.exitCode === 0);
await writeFile(path.join(directory, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.passed ? 0 : 1;
