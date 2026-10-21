import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
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
const moduleName = "ratecard";
const npm = "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js";
const tests = process.argv.slice(2);
if (tests.length === 0 && readdirSync(path.join(backend, "src/modules", moduleName), { recursive: true }).some((file) => String(file).endsWith(".test.ts"))) tests.push("src/modules/" + moduleName + "/**/*.test.ts");
const checks = [
  ["scoped-lint", ["node_modules/eslint/bin/eslint.js", "src/modules/" + moduleName + "/**/*.ts", "--max-warnings", "0"]],
  ...(tests.length > 0 ? [["focused-tests", ["-r", "./scripts/register-ts.js", "--test", ...tests]]] : []),
  ["contracts", [npm, "run", "test:contracts"]],
  ["typecheck", [npm, "run", "typecheck"]],
  ["build", [npm, "run", "build"]]
];
const results = tests.length > 0 ? [] : [{ name: "focused-tests", applicable: false, reason: "No existing module-local test files; final cumulative application suite remains required." }];
for (const [name, args] of checks) {
  const run = spawnSync(process.execPath, args, { cwd: backend, env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(path.join(evidence, name + ".log"), (run.stdout ?? "") + (run.stderr ?? "") + (run.error ? String(run.error) : ""));
  results.push({ name, status: run.status, signal: run.signal, passed: run.status === 0 });
  console.log(name + ": " + run.status);
}
const lint = spawnSync(process.execPath, ["node_modules/eslint/bin/eslint.js", "src/**/*.ts", "--format", "json", "--max-warnings", "0"], { cwd: backend, env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
let lintCounts;
try {
  const rows = JSON.parse(lint.stdout);
  const diagnostics = rows.filter((row) => row.errorCount > 0 || row.warningCount > 0).map(({ source, ...row }) => row);
  lintCounts = {
    files: rows.length,
    errors: rows.reduce((sum, row) => sum + row.errorCount, 0),
    warnings: rows.reduce((sum, row) => sum + row.warningCount, 0)
  };
  writeFileSync(path.join(evidence, "whole-lint.json"), JSON.stringify({ counts: lintCounts, diagnostics }, null, 2) + "\n");
} catch (error) {
  writeFileSync(path.join(evidence, "whole-lint-error.log"), String(error) + "\n" + (lint.stderr ?? ""));
  results.push({ name: "whole-lint-capture", passed: false, status: lint.status });
}
writeFileSync(path.join(evidence, "summary.json"), JSON.stringify({ checks: results, wholeLint: lintCounts, wholeLintStatus: lint.status }, null, 2) + "\n");
console.log(JSON.stringify(lintCounts));
process.exitCode = results.every((result) => result.passed || result.applicable === false) ? 0 : 1;
