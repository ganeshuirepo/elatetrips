import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const backendDirectory = fileURLToPath(new URL('../../', import.meta.url));
export const worktreeDirectory = path.dirname(backendDirectory.replace(/[\\/]$/, ''));
export function safeEnvironment(ambient = process.env) {
  const environment = {};
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
  for (const [name, value] of Object.entries(ambient))
    if (allow.has(name.toLowerCase()) && typeof value === 'string') environment[name] = value;
  return Object.assign(environment, {
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
    MONGOMS_SYSTEM_BINARY: path.join(
      worktreeDirectory,
      '.claude',
      '.cache',
      '014-acceptance',
      'mongod-x64-win32-8.2.6.exe',
    ),
    MONGOMS_VERSION: '8.2.6',
    MONGOMS_RUNTIME_DOWNLOAD: 'false',
    npm_config_cache: path.join(worktreeDirectory, '.claude', '.cache', '014-acceptance', 'npm'),
    npm_config_update_notifier: 'false',
    npm_config_ignore_scripts: 'true',
  });
}
export const checkNames = ['test:harness', 'test:contracts', 'lint', 'typecheck', 'test', 'build'];
export function lintDiagnostics(results) {
  const empty = () => ({ files: 0, errors: 0, warnings: 0 });
  const counts = { all: empty(), foundation: empty(), legacy: empty() };
  const diagnostics = results.map(({ filePath, errorCount, warningCount, messages }) => {
    const file = path.relative(backendDirectory, filePath).replaceAll('\\', '/');
    const group =
      file.startsWith('src/modules/foundation/') ||
      ['src/modules/auth/token.service.ts', 'src/modules/auth/token.service.test.ts'].includes(file)
        ? 'foundation'
        : 'legacy';
    for (const key of ['all', group]) {
      counts[key].files++;
      counts[key].errors += errorCount;
      counts[key].warnings += warningCount;
    }
    // ESLint may attach whole source strings; retain diagnostics only.
    return { file, group, errorCount, warningCount, messages };
  });
  return { counts, diagnostics };
}
export async function verifyAcceptance(label, npmCli = process.env.npm_execpath, mode = 'full') {
  if (!/^[a-z][a-z0-9-]{0,50}$/.test(label ?? ''))
    throw new Error('Supply a short evidence label: npm run verify:acceptance -- <label>');
  if (!npmCli || path.basename(npmCli) !== 'npm-cli.js')
    throw new Error('Run through npm run verify:acceptance so the installed npm CLI is explicit');
  if (!['full', 'tooling'].includes(mode)) throw new Error('Unknown verification mode');
  const directory = path.join(
    worktreeDirectory,
    '.claude',
    'elatetrips-specs',
    'specs',
    '014-v10-acceptance-harness',
    'evidence',
    label,
  );
  // Exclusive directory creation prevents silently overwriting previous evidence.
  await mkdir(path.dirname(directory), { recursive: true });
  await mkdir(directory);
  const commit = execFileSync(
    'git',
    ['-c', `safe.directory=${worktreeDirectory.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'],
    {
      cwd: worktreeDirectory,
      env: safeEnvironment(),
      encoding: 'utf8',
      windowsHide: true,
    },
  ).trim();
  const report = {
    format: 1,
    mode,
    commit,
    startedAt: new Date().toISOString(),
    node: process.version,
    checks: [],
  };
  for (const name of checkNames.filter((name) => mode === 'full' || name !== 'test')) {
    const filename = name.replaceAll(':', '-');
    const output = createWriteStream(path.join(directory, `${filename}.stdout.txt`));
    const errors = createWriteStream(path.join(directory, `${filename}.stderr.txt`));
    const startedAt = new Date().toISOString();
    const args = ['run', name];
    const lintFile = path.join(directory, 'lint.json');
    if (name === 'lint') args.push('--', '--format', 'json', '--output-file', lintFile);
    const child = spawn(process.execPath, [npmCli, ...args], {
      cwd: backendDirectory,
      env: safeEnvironment(),
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
    let diagnosticSummary;
    if (name === 'lint') {
      try {
        const details = lintDiagnostics(JSON.parse(await readFile(lintFile, 'utf8')));
        await writeFile(lintFile, `${JSON.stringify(details, null, 2)}\n`);
        diagnosticSummary = details.counts;
      } catch (error) {
        diagnosticSummary = { reportError: error.message };
      }
    }
    report.checks.push({
      name,
      command: ['npm', ...args],
      startedAt,
      completedAt: new Date().toISOString(),
      ...result,
      ...(diagnosticSummary ? { diagnostics: diagnosticSummary } : {}),
    });
    console.log(`${name}: ${result.exitCode ?? result.launchError ?? result.signal}`);
    await writeFile(path.join(directory, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  report.completedAt = new Date().toISOString();
  report.passed = report.checks.every((check) => check.exitCode === 0);
  await writeFile(path.join(directory, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyAcceptance(process.argv[2], process.env.npm_execpath, process.argv[3] ?? 'full')
    .then((report) => {
      process.exitCode = report.passed ? 0 : 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
