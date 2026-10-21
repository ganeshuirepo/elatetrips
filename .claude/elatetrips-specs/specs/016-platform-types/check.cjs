const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const worktree = path.resolve(__dirname, '../../../..');
const backend = path.join(worktree, 'elatetrips-node');
const evidence = path.join(__dirname, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
const allow = new Set('PATH,SystemRoot,windir,ComSpec,PATHEXT,TEMP,TMP,USERPROFILE,HOMEDRIVE,HOMEPATH,APPDATA,LOCALAPPDATA,PROGRAMFILES,PROGRAMFILES(X86),PROGRAMDATA,NUMBER_OF_PROCESSORS,PROCESSOR_ARCHITECTURE'.toUpperCase().split(','));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allow.has(key.toUpperCase())));
Object.assign(env, {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:1/v10-test-disabled',
  JWT_SECRET: 'fixture-v10-test-secret-not-production',
  ADMIN_KEY: 'fixture-v10-admin-not-production',
  BREVO_API_KEY: '', TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '',
  FAST2SMS_API_KEY: '', SMTP_HOST: '', SMTP_USER: '', SMTP_PASSWORD: '',
  MONGOMS_SYSTEM_BINARY: 'D:/projects/elatetrips-experiences/.worktrees/v10-acceptance-harness/.claude/.cache/014-acceptance/mongod-x64-win32-8.2.6.exe',
  MONGOMS_VERSION: '8.2.6', MONGOMS_RUNTIME_DOWNLOAD: 'false',
  npm_config_ignore_scripts: 'true', npm_config_update_notifier: 'false',
  npm_config_cache: path.join(worktree, '.claude/.cache/016-acceptance/npm'),
});
const mode = process.argv[2];
if (mode === 'test' && process.argv.length < 4) throw new Error('Explicit test file paths are required');
const scoped = ['src/container.ts', 'src/common/logger.ts', 'src/common/middleware/errorHandler.ts', 'src/repositories/MongoReadRepository.ts'];
const commands = {
  typecheck: ['C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js', 'run', 'typecheck'],
  contracts: ['C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js', 'run', 'test:contracts'],
  build: ['C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js', 'run', 'build'],
  lint: ['node_modules/eslint/bin/eslint.js', ...scoped, '--max-warnings', '0', '--format', 'json'],
  'lint-all': ['node_modules/eslint/bin/eslint.js', 'src', '--format', 'json'],
  test: ['-r', './scripts/register-ts.js', '--test', ...process.argv.slice(3)],
};
if (!commands[mode]) throw new Error('Unknown check');
const args = commands[mode];
const result = spawnSync('C:/Program Files/nodejs/node.exe', args, { cwd: backend, env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
if (mode.startsWith('lint')) {
  const sanitized = JSON.parse(result.stdout).map(({ source, ...entry }) => entry);
  fs.writeFileSync(path.join(evidence, `${mode}.json`), JSON.stringify(sanitized, null, 2) + '\n');
  const totals = sanitized.reduce((sum, entry) => ({ errors: sum.errors + entry.errorCount, warnings: sum.warnings + entry.warningCount }), { errors: 0, warnings: 0 });
  console.log(JSON.stringify({ mode, ...totals, status: result.status }));
} else {
  const output = (result.stdout || '') + (result.stderr || '');
  fs.writeFileSync(path.join(evidence, `${mode}.log`), output);
  process.stdout.write(output);
}
fs.writeFileSync(path.join(evidence, `${mode}-result.json`), JSON.stringify({ command: ['C:/Program Files/nodejs/node.exe', ...args], status: result.status, error: result.error?.message }, null, 2) + '\n');
process.exitCode = result.status ?? 1;
