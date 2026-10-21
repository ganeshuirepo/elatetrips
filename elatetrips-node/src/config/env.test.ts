/**
 * Configuration fail-closed tests.
 * Run: `npm test` (Node's own runner; see scripts/register-ts.js).
 *
 * `config/env` is evaluated ONCE at import, so every case here boots a child
 * process with its own environment. Testing it in-process would prove nothing:
 * the module would already be loaded with this process's settings.
 *
 * What these pin down: a production process must refuse to start on a missing
 * or publicly-known secret. The failure mode being prevented is the quiet one —
 * a deployment that forgot a variable, falls back to a committed default, and
 * looks completely healthy while its admin API is open to anyone who has read
 * the repository.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';

const REGISTER = resolve(__dirname, '../../scripts/register-ts.js');
const ENV_MODULE = resolve(__dirname, './env.ts');
const TSCONFIG = resolve(__dirname, '../../tsconfig.json');

/**
 * config/env calls `dotenv.config()`, which reads `.env` relative to the
 * CURRENT WORKING DIRECTORY. Booting the child in the repo would therefore let
 * the developer's own .env supply the very variables a case is trying to leave
 * unset — the test would pass or fail depending on whose machine it ran on.
 * Running from an empty directory makes "unset" actually mean unset.
 */
const ISOLATED_CWD = mkdtempSync(resolve(tmpdir(), 'elate-env-test-'));

const STRONG_JWT = 'test-only-strong-jwt-secret';
const STRONG_ADMIN = 'test-only-strong-admin-key';

/** Import config/env in a child process with the given environment. */
function boot(vars: Record<string, string | undefined>): { ok: boolean; stderr: string } {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...process.env, ...vars })) {
    // An explicit `undefined` means "unset this", which a child env cannot express
    // by assignment — omitting the key is how it is done.
    if (v !== undefined) env[k] = v;
  }
  // ts-node resolves its project from the cwd, which is now empty — point it
  // back at the real tsconfig.
  env.TS_NODE_PROJECT = TSCONFIG;
  const result = spawnSync(process.execPath, ['-r', REGISTER, '-e', `require(${JSON.stringify(ENV_MODULE)})`], {
    cwd: ISOLATED_CWD,
    env,
    encoding: 'utf8',
  });
  return { ok: result.status === 0, stderr: result.stderr };
}

test('development starts with no secrets set at all', () => {
  // Local work and CI must not need a keyring; only production is strict.
  const { ok } = boot({ NODE_ENV: 'development', JWT_SECRET: undefined, ADMIN_KEY: undefined });
  assert.equal(ok, true);
});

test('production starts when both secrets are strong', () => {
  const { ok, stderr } = boot({
    NODE_ENV: 'production',
    JWT_SECRET: STRONG_JWT,
    ADMIN_KEY: STRONG_ADMIN,
  });
  assert.equal(ok, true, stderr);
});

test('production refuses to start with no ADMIN_KEY', () => {
  const { ok, stderr } = boot({
    NODE_ENV: 'production',
    JWT_SECRET: STRONG_JWT,
    ADMIN_KEY: undefined,
  });
  assert.equal(ok, false, 'a production boot without ADMIN_KEY must be fatal');
  assert.match(stderr, /ADMIN_KEY must be set/);
});

test('production refuses the old committed default admin key', () => {
  // This value is in the git history, so it is public knowledge.
  const { ok, stderr } = boot({
    NODE_ENV: 'production',
    JWT_SECRET: STRONG_JWT,
    ADMIN_KEY: 'elate-admin-key',
  });
  assert.equal(ok, false);
  assert.match(stderr, /ADMIN_KEY must be set/);
});

test('production refuses the placeholder the example file ships', () => {
  // Copying .env.production.example and forgetting to edit it is the single
  // likeliest way this goes wrong, so it must not be a working key.
  for (const placeholder of ['<change-me>', 'change-me']) {
    const { ok } = boot({
      NODE_ENV: 'production',
      JWT_SECRET: STRONG_JWT,
      ADMIN_KEY: placeholder,
    });
    assert.equal(ok, false, `${placeholder} must not be accepted`);
  }
});

test('production refuses a blank ADMIN_KEY', () => {
  // `ADMIN_KEY=` in an env file reads as set-but-empty; without the trim it
  // would sail past a truthiness check and authenticate an empty header.
  const { ok } = boot({ NODE_ENV: 'production', JWT_SECRET: STRONG_JWT, ADMIN_KEY: '   ' });
  assert.equal(ok, false);
});

test('production still refuses a missing or default JWT secret', () => {
  // Regression guard: the admin-key work refactored this function's condition.
  for (const secret of [undefined, 'change-me-in-production']) {
    const { ok, stderr } = boot({
      NODE_ENV: 'production',
      JWT_SECRET: secret,
      ADMIN_KEY: STRONG_ADMIN,
    });
    assert.equal(ok, false, `JWT_SECRET=${String(secret)} must be fatal`);
    assert.match(stderr, /JWT_SECRET must be set/);
  }
});
