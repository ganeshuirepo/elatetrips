/**
 * TypeScript hook for `npm test`.
 *
 * The suite runs on Node's OWN test runner (node:test) — deliberately, so the
 * API keeps zero test-framework dependencies and the tests run anywhere the
 * server already runs. This file is the only glue: it registers ts-node so
 * `node --test` can load .ts sources directly.
 *
 * Transpile-only on purpose. Type errors are `npm run typecheck`'s job; paying
 * for a full type-check on every run would make the suite slow enough that
 * people quietly stop running it. Set here rather than as a shell prefix so the
 * command stays identical on Windows and CI.
 */
process.env.TS_NODE_TRANSPILE_ONLY = '1';
require('ts-node/register');
