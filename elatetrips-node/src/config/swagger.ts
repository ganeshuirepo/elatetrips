import swaggerJsdoc from 'swagger-jsdoc';
import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from './env';

/**
 * OpenAPI spec assembled from the JSDoc `@openapi` annotations on the route
 * files. Co-locating docs with routes keeps them honest — the docs live next to
 * the code they describe.
 */
export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'ElateTrips API',
      version: '1.0.0',
      description:
        'REST API for the ElateTrips celebration trip planner — catalog, mock OTP auth, profiles, pricing, orders and hotelier partner sign-ups.',
    },
    servers: [{ url: `http://localhost:${env.port}`, description: 'Local' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    tags: [
      { name: 'System', description: 'Health & diagnostics' },
      { name: 'Partners', description: 'Public hotelier "Expression of Interest" submissions.' },
    ],
  },
  // Scan compiled-or-source route files for annotations.
  apis: ['src/**/*.routes.ts', 'src/routes/*.ts', 'dist/**/*.routes.js', 'dist/routes/*.js'],
});

/** Mounts Swagger UI at /docs and the raw JSON at /docs.json. */
export function mountSwagger(app: Express): void {
  app.get('/docs.json', (_req, res) => res.json(swaggerSpec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'ElateTrips API' }));
}
