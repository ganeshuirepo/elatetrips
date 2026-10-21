import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, "../../../..");
const backend = path.join(root, "elatetrips-node");
const out = path.join(folder, "evidence", "delivery-runtime");
await mkdir(out, { recursive: true });
const environment = {
  ...process.env,
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://127.0.0.1:1/v10-test-disabled",
  JWT_SECRET: "fixture-v10-test-secret-not-production",
  ADMIN_KEY: "fixture-v10-admin-not-production",
  BREVO_API_KEY: "",
  TWILIO_ACCOUNT_SID: "",
  TWILIO_AUTH_TOKEN: "",
  FAST2SMS_API_KEY: "",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  MONGOMS_DOWNLOAD_DIR: path.join(root, ".mongo-test-binaries"),
};
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const summary = {
  capturedAt: new Date().toISOString(),
  baselineCommit: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim(),
  safety:
    "Controlled fixture environment; no original .env, production database, providers or messages.",
  checks: [],
};
for (const [name, command] of [
  [
    "focused",
    "node -r ./scripts/register-ts.js --test src/modules/foundation/delivery-runtime.test.ts",
  ],
  ["typecheck", `${npm} run typecheck`],
  ["build", `${npm} run build`],
]) {
  const started = Date.now();
  let log = "";
  const exitCode = await new Promise((resolve) => {
    const child = spawn(command, {
      cwd: backend,
      env: environment,
      shell: true,
      windowsHide: true,
    });
    child.stdout.on("data", (chunk) => {
      log += chunk;
    });
    child.stderr.on("data", (chunk) => {
      log += chunk;
    });
    child.on("error", (error) => {
      log += error.message;
    });
    child.on("close", resolve);
  });
  await writeFile(path.join(out, `${name}.log`), log);
  summary.checks.push({
    name,
    command,
    exitCode,
    durationMs: Date.now() - started,
  });
  await writeFile(
    path.join(out, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(`${name}: exit=${exitCode}`);
}
process.exitCode = summary.checks.some((check) => check.exitCode !== 0) ? 1 : 0;
