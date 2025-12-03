/**
 * Minimal router for Cloudflare Workers
 * No dependencies - uses native Web APIs
 */

export class Router {
  constructor(basePath = '') {
    this.routes = [];
    // Normalize base path (remove trailing slash)
    this.basePath = basePath.replace(/\/$/, '');
  }

  add(method, path, handler) {
    if (typeof method !== 'string') {
      throw new TypeError('Router.add: "method" must be a string');
    }
    if (typeof path !== 'string') {
      throw new TypeError('Router.add: "path" must be a string');
    }
    if (typeof handler !== 'function') {
      throw new TypeError('Router.add: "handler" must be a function');
    }
    // Convert path pattern to regex via helper for clarity
    const pattern = this.pathToRegex(path);
    this.routes.push({
      method: method.toUpperCase(),
      pattern: new RegExp(`^${pattern}$`),
      handler
    });
    return this;
  }

  // Extracted helper for building route regex from path pattern
  pathToRegex(path) {
    // Escape backslashes first, then forward slashes, then convert :params
    return path
      .replace(/\\/g, '\\\\')
      .replace(/\//g, '\\/')
      .replace(/:(\w+)/g, '(?<$1>[^/]+)');
  }

  get(path, handler) { return this.add('GET', path, handler); }
  post(path, handler) { return this.add('POST', path, handler); }
  put(path, handler) { return this.add('PUT', path, handler); }
  delete(path, handler) { return this.add('DELETE', path, handler); }

  async handle(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    let path = url.pathname;

    // Strip base path if present
    if (this.basePath && path.startsWith(this.basePath)) {
      path = path.slice(this.basePath.length) || '/';
    }

    for (const route of this.routes) {
      if (route.method !== method && route.method !== 'ALL') continue;
      const match = path.match(route.pattern);
      if (match) {
        const params = match.groups || {};
        return route.handler(request, env, ctx, params);
      }
    }
    return error('Not Found', 404); // No route matched
  }
}

/**
 * JSON response helper
 */
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

/**
 * Error response helper
 */
export function error(message, status = 400) {
  return json({ error: message }, status);
}

/**
 * CORS headers for cross-origin requests
 */
export function corsHeaders(origin = '*') {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}
