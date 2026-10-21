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
        /** Console/partner tokens: same header, different issuer and scope. */
        consoleAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        /**
         * Every successful response on this API has the same two keys. Declaring
         * it once means an operation says what is IN `data` instead of restating
         * the wrapper 150 times.
         */
        Envelope: {
          type: 'object',
          properties: { success: { type: 'boolean', example: true }, data: {} },
          required: ['success', 'data'],
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: { message: { type: 'string' }, details: {} },
              required: ['message'],
            },
          },
          required: ['success', 'error'],
        },
      },
      responses: {
        Ok: {
          description: 'Success — `{ success: true, data }`.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Envelope' } } },
        },
        BadRequest: {
          description: 'Validation failed.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        Unauthorized: {
          description: 'Missing, expired or rejected token.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        NotFound: {
          description: 'No such record.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
    tags: [
      { name: 'System', description: 'Health & diagnostics' },
      { name: 'Partners', description: 'Public hotelier "Expression of Interest" submissions.' },
      { name: 'Weddings', description: 'Public wedding-enquiry leads from the planner.' },
      { name: 'Contracts', description: 'The frozen contracts-v1.x surface: RFQ intake, itinerary, supplier routing, quotes, checkout, policy. Mirrors /contracts/api.md exactly.' },
      { name: 'Support', description: 'Post-booking support: the per-trip guest thread, crew tasks and the ops console.' },
      { name: 'Suppliers', description: 'Supplier directory, capabilities and scorecards.' },
      { name: 'Ratecards', description: 'Supplier rate cards and the rates quotes are built from.' },
      { name: 'Broadcast', description: 'Sending an RFQ to suppliers in waves.' },
      { name: 'Comms', description: 'Outbound messages — email today, WhatsApp when it lands.' },
      { name: 'Admin', description: 'Catalog CRUD and vendor onboarding. Console token, admin role.' },
      { name: 'Console', description: 'Staff sign-in for the admin, vendor, crew and ops consoles.' },
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
