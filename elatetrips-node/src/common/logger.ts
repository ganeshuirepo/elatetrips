/* eslint-disable no-console */

/**
 * Minimal logging facade. Centralising logging behind one module means swapping
 * in pino/winston later touches a single file, not the whole codebase.
 */
export const logger = {
  info: (msg: string, ...meta: unknown[]) => console.log(`[info] ${msg}`, ...meta),
  warn: (msg: string, ...meta: unknown[]) => console.warn(`[warn] ${msg}`, ...meta),
  error: (msg: string, ...meta: unknown[]) => console.error(`[error] ${msg}`, ...meta),
};
