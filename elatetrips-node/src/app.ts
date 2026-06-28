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

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins.length ? env.corsOrigins : true }));
  app.use(compression());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  if (!env.isProd) app.use(morgan('dev'));

  mountSwagger(app);

  const container = createContainer();
  app.use('/api/v1', buildApiRouter(container));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
