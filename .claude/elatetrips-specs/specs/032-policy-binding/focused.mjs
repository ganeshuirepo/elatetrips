import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const spec = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(spec, "../../../..");
const backend = path.join(root, "elatetrips-node");
const evidence = path.join(spec, "evidence");
mkdirSync(evidence, { recursive: true });
const osKeys = new Set([
  "PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP",
  "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA",
  "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMDATA",
  "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE"
]);
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => osKeys.has(key.toUpperCase()))
);
Object.assign(env, {
  NODE_ENV: "test", MONGODB_URI: "mongodb://127.0.0.1:1/v10-test-disabled",
  JWT_SECRET: "fixture-v10-test-secret-not-production",
  ADMIN_KEY: "fixture-v10-admin-not-production",
  BREVO_API_KEY: "", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "",
  FAST2SMS_API_KEY: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASSWORD: "",
  MONGOMS_SYSTEM_BINARY: "D:/projects/elatetrips-experiences/.worktrees/v10-acceptance-harness/.claude/.cache/014-acceptance/mongod-x64-win32-8.2.6.exe",
  MONGOMS_VERSION: "8.2.6", MONGOMS_RUNTIME_DOWNLOAD: "false",
  npm_config_ignore_scripts: "true", npm_config_update_notifier: "false",
  npm_config_cache: path.join(root, ".claude", ".cache", "scoped-acceptance", "npm")
});
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--repair-checks') {
  let failed = false;
  for (const [name, command] of [['scoped-lint-final', ['node_modules/eslint/bin/eslint.js', 'src/modules/policy/**/*.ts', '--max-warnings', '0']], ['typecheck-final', ['C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js', 'run', 'typecheck']]]) {
    const run = spawnSync(process.execPath, command, { cwd: backend, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    writeFileSync(path.join(evidence, name + '.log'), (run.stdout ?? '') + (run.stderr ?? '') + (run.error ? String(run.error) : ''));
    console.log(name + ': ' + run.status); failed ||= run.status !== 0;
  }
  process.exitCode = failed ? 1 : 0;
} else {
  if (!args.length || args.some((test) => !/^src\/modules\/policy\/[a-z.-]+\.test\.ts$/.test(test))) throw new Error('Explicit owned test paths required');
  const run = spawnSync(process.execPath, ['-r', './scripts/register-ts.js', '--test', ...args], { cwd: backend, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(path.join(evidence, 'focused-development.log'), (run.stdout ?? '') + (run.stderr ?? '') + (run.error ? String(run.error) : ''));
  console.log(run.stdout); console.error(run.stderr); process.exitCode = run.status ?? 1;
}
