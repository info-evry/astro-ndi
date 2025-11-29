/**
 * Cryptographic utilities
 */

/**
 * Hash password using Web Crypto API (SHA-256)
 * @param {string} password
 * @returns {Promise<string>} Hex-encoded hash
 */
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
