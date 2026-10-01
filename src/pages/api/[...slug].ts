/**
 * Catch-all API route that delegates to the existing router
 * This preserves all the well-tested API handlers
 *
 * CORS, the 404/500 answers and the origin allow-list are handled by
 * `createApiRoute` (astro-core/api-route): every response, router errors
 * included, carries the CORS headers.
 */

import { env } from 'cloudflare:workers';
import { createApiRoute } from 'astro-core/api-route';
import { createRouter } from '../../routes.js';

// Allowed origins for CORS - production and development origins.
// The first entry is the fallback for unknown callers. Keep in sync with
// allowedOriginsFor('ndi') in the maestro root `src/sites.ts` (checked by its tests).
const ALLOWED_ORIGINS = [
  // Production
  'https://asso.info-evry.fr',
  'https://ndi.asso.info-evry.fr',
  // Development (Cloudflare Workers)
  'https://ndi-registration-dev.asso-1b5.workers.dev',
  'https://asso-info-evry-dev.asso-1b5.workers.dev',
  'https://join-info-evry-dev.asso-1b5.workers.dev',
  // Local development
  'http://localhost:4321',
  'http://localhost:3000',
  'http://127.0.0.1:4321',
  'http://127.0.0.1:3000'
];

export const { ALL, GET, POST, PUT, DELETE, OPTIONS } = createApiRoute({
  router: createRouter(),
  allowedOrigins: ALLOWED_ORIGINS,
  getEnv: () => env,
  getCtx: (locals) => locals.cfContext
});
