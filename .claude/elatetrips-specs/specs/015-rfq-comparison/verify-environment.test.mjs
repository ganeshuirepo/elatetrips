import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('the focused wrapper removes runtime injection and unrelated secrets before spawning Node', () => {
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      fileURLToPath(new URL('./verify-focused.ps1', import.meta.url)),
      '-EnvironmentProbe',
    ],
    {
      env: {
        ...process.env,
        NODE_OPTIONS: '--require synthetic-review-missing-module',
        NODE_PATH: 'C:/synthetic-review-path',
        SYNTHETIC_REVIEW_SECRET: 'fixture-only-secret',
        JWT_SECRET: 'fixture-ambient-value-must-be-replaced',
      },
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(
    result.stdout,
    /Environment probe passed: injection absent; fixture configuration present/,
  );
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /fixture-only-secret|fixture-ambient-value-must-be-replaced/,
  );
});
