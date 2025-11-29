/**
 * Nuit de l'Info Registration System
 * Cloudflare Workers Entry Point
 */

import { corsHeaders } from './lib/router.js';
import { error } from './shared/response.js';
import { createRouter } from './routes.js';

const router = createRouter();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // API routes
    if (url.pathname.startsWith('/api/')) {
      try {
        const response = await router.handle(request, env, ctx);
        if (response) {
          // Add CORS headers to all API responses
          const headers = new Headers(response.headers);
          Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));
          return new Response(response.body, {
            status: response.status,
            headers
          });
        }
        return error('Not found', 404);
      } catch (err) {
        console.error('API error:', err);
        return error('Internal server error', 500);
      }
    }

    // Serve static files (handled by Cloudflare assets)
    // For SPA routing, redirect non-file requests to index.html
    if (!url.pathname.includes('.') && url.pathname !== '/') {
      // Check if this is admin route
      if (url.pathname.startsWith('/admin')) {
        return env.ASSETS.fetch(new Request(new URL('/admin.html', request.url), request));
      }
      // Default to index.html for SPA routing
      return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
    }

    // Let Cloudflare serve static assets
    return env.ASSETS.fetch(request);
  }
};
