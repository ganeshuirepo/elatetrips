import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { env } from './config/env';
import { mountSwagger } from './config/swagger';
import { createContainer } from './container';
import { buildApiRouter } from './routes';
import { notFound } from './common/middleware/notFound';
import { errorHandler } from './common/middleware/errorHandler';

/**
 * Builds the Express application: middleware → docs → API → 404 → error handler.
 * Pure assembly with no listening, so it can be imported by tests.
 */
export function createApp(): Express {
  const app = express();

  // One proxy hop (nginx) sets X-Forwarded-For, so req.ip is the real client.
  // Without this every request looks like 127.0.0.1 and the per-IP rate limits
  // collapse into one shared bucket. `1` rather than `true`: trusting the whole
  // chain lets a caller spoof the header and dodge the limit.
  app.set('trust proxy', 1);

  app.use(helmet());
  // No wildcard fallback in production — an unset CORS_ORIGINS must fail closed,
  // not quietly open the API to every origin.
  if (env.isProd && env.corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must be set in production');
  }
  app.use(cors({ origin: env.corsOrigins.length ? env.corsOrigins : true }));
  app.use(compression());
  // Bounded bodies: the largest legitimate payload here is an order with its
  // lines, comfortably under 100kb.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  if (!env.isProd) app.use(morgan('dev'));

  mountSwagger(app);

  const container = createContainer();
  app.use('/api/v1', buildApiRouter(container));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
