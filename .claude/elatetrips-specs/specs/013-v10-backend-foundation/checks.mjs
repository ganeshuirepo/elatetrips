import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const backend = path.join(root, 'elatetrips-node');
const label = process.argv[2] ?? 'baseline';
if (!/^[a-z-]+$/.test(label)) throw Error('Invalid evidence label');
const out = path.join(folder, 'evidence', label);
await mkdir(out, { recursive: true });
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const scripts = JSON.parse(await readFile(path.join(backend, 'package.json'), 'utf8')).scripts;
const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
const environment = { ...process.env, NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:1/v10-test-disabled',
  JWT_SECRET: 'fixture-v10-test-secret-not-production', ADMIN_KEY: 'fixture-v10-admin-not-production',
  BREVO_API_KEY: '', TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', FAST2SMS_API_KEY: '',
  SMTP_HOST: '', SMTP_USER: '', SMTP_PASSWORD: '',
  MONGOMS_DOWNLOAD_DIR: path.join(root, '.mongo-test-binaries'),
};
const summary = { label, capturedAt: new Date().toISOString(), baselineCommit: commit,
  dependencySetup: 'Junction to supplied backend installation; original .env and deployment files are not copied.',
  safety: 'Test environment, fixture JWT/admin keys, no original database/provider credentials; real database URI disabled.',
  scripts, missingScripts: ['lint', 'test:contracts'].filter((name) => !scripts[name]), checks: [] };
for (const name of ['typecheck', 'test', 'build']) {
  const command = `${npm} run ${name}`;
  console.log(`Starting ${label}: ${command}`);
  const result = await new Promise((resolve) => {
    const started = Date.now(); let log = '';
    const child = spawn(command, { cwd: backend, env: environment, shell: true, windowsHide: true });
    child.stdout.on('data', (chunk) => { log += chunk; });
    child.stderr.on('data', (chunk) => { log += chunk; });
    child.on('error', (error) => { log += error.message; });
    child.on('close', (exitCode) => resolve({ name, command, exitCode, durationMs: Date.now() - started, log }));
  });
  const { log, ...check } = result;
  await writeFile(path.join(out, `${name}.log`), log);
  summary.checks.push(check);
  await writeFile(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(`${name}: exit=${check.exitCode}, ${Math.round(check.durationMs / 1000)}s`);
}
process.exitCode = summary.checks.some((check) => check.exitCode !== 0) ? 1 : 0;
