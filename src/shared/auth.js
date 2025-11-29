/**
 * Authentication helpers
 */

/**
 * Verify admin token from Authorization header
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<boolean>}
 */
export async function verifyAdmin(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);

  // Check against KV stored token or environment variable
  let adminToken = env.ADMIN_TOKEN;
  if (env.CONFIG) {
    try {
      const storedToken = await env.CONFIG.get('admin_token');
      if (storedToken) adminToken = storedToken;
    } catch (e) {
      // Fall back to env variable
    }
  }

  return token && adminToken && token === adminToken;
}
