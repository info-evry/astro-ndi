/**
 * Authentication helpers
 */

/**
 * Constant-time string comparison to prevent timing attacks
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  // If lengths differ, compare a against itself to maintain constant time
  // but always return false
  if (aBytes.length !== bBytes.length) {
    // Still do the comparison to prevent length-based timing attacks
    let result = 0;
    for (let i = 0; i < aBytes.length; i++) {
      result |= aBytes[i] ^ aBytes[i];
    }
    return false;
  }

  // XOR all bytes and accumulate differences
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }

  return result === 0;
}

/**
 * Verify admin token from Authorization header
 * Uses constant-time comparison to prevent timing attacks
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

  if (!token || !adminToken) {
    return false;
  }

  return timingSafeEqual(token, adminToken);
}
