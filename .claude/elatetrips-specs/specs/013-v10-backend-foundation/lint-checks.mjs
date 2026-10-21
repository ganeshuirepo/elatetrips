import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const backend = path.join(root, 'elatetrips-node');
const harness = 'D:/projects/elatetrips-experiences/.worktrees/v10-acceptance-harness';
const out = path.join(folder, 'evidence/scoped-lint');
await mkdir(out, { recursive: true });
const environment = {
  ...process.env,
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
  MONGOMS_SYSTEM_BINARY: `${harness}/.claude/.cache/014-acceptance/mongod-x64-win32-8.2.6.exe`,
  MONGOMS_VERSION: '8.2.6',
  MONGOMS_RUNTIME_DOWNLOAD: 'false',
};
const checks = [
  [
    'lint',
    `node ${harness}/elatetrips-node/node_modules/eslint/bin/eslint.js --config ${harness}/elatetrips-node/eslint.config.mjs "src/modules/foundation/**/*.ts" "src/modules/auth/token.service*.ts" --max-warnings 0`,
  ],
  ['typecheck', 'npm.cmd run typecheck'],
  [
    'focused',
    'node -r ./scripts/register-ts.js --test src/modules/auth/token.service.test.ts "src/modules/foundation/*.test.ts"',
  ],
  ['build', 'npm.cmd run build'],
];
const summary = {
  capturedAt: new Date().toISOString(),
  baselineCommit: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim(),
  scope: 'Feature013 foundation and scoped credential files only; not a whole-backend lint result.',
  safety:
    'Fixture environment and disposable local Mongo only; provider keys cleared; original environment not loaded. Cached tooling binary, no runtime download.',
  checks: [],
};
for (const [name, command] of checks) {
  console.log(`Starting ${name}`);
  const result = await new Promise((resolve) => {
    const started = Date.now();
    let log = '';
    const child = spawn(command, {
      cwd: backend,
      env: environment,
      shell: true,
      windowsHide: true,
    });
    child.stdout.on('data', (chunk) => {
      log += chunk;
    });
    child.stderr.on('data', (chunk) => {
      log += chunk;
    });
    child.on('error', (error) => {
      log += error.message;
    });
    child.on('close', (exitCode) =>
      resolve({ name, command, exitCode, durationMs: Date.now() - started, log }),
    );
  });
  const { log, ...check } = result;
  await writeFile(path.join(out, `${name}.log`), log);
  summary.checks.push(check);
  await writeFile(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(`${name}: exit=${check.exitCode}`);
}
process.exitCode = summary.checks.some((check) => check.exitCode !== 0) ? 1 : 0;
