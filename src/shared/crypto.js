/**
 * Cryptographic utilities
 *
 * Password hashing uses PBKDF2 with random salt for new passwords.
 * Legacy SHA-256 hashes (without salt) are supported for backward compatibility.
 */

/**
 * Hash password using PBKDF2 with random salt
 * @param {string} password - Plain text password
 * @param {string|null} existingSalt - Optional salt for verification (hex-encoded)
 * @returns {Promise<string>} Format: "salt:hash" (both hex-encoded)
 */
export async function hashPassword(password, existingSalt = null) {
  const encoder = new TextEncoder();

  // Generate or use existing salt
  let salt;
  if (existingSalt) {
    salt = existingSalt;
  } else {
    const saltArray = new Uint8Array(16);
    crypto.getRandomValues(saltArray);
    salt = Array.from(saltArray).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive key using PBKDF2 with 100,000 iterations
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return `${salt}:${hash}`;
}

/**
 * Verify password against stored value
 * Supports three formats (in order of priority):
 * 1. New PBKDF2 format: "salt:hash" (contains colon)
 * 2. Legacy SHA-256 format: 64 hex characters
 * 3. Plain text (fallback for unencrypted databases)
 *
 * @param {string} password - Plain text password to verify
 * @param {string} storedValue - Stored value (hash or plain text)
 * @returns {Promise<boolean>} True if password matches
 */
export async function verifyPassword(password, storedValue) {
  // Empty stored value - no password set
  if (!storedValue) {
    return false;
  }

  // Format 1: New PBKDF2 format (contains colon separator)
  if (storedValue.includes(':')) {
    const [salt] = storedValue.split(':');
    const computed = await hashPassword(password, salt);
    return computed === storedValue;
  }

  // Format 2: Legacy SHA-256 format (64 hex characters)
  if (/^[a-f0-9]{64}$/i.test(storedValue)) {
    console.warn('SECURITY: Legacy SHA-256 password hash detected - should be upgraded to PBKDF2');
    const legacyHash = await legacyHashPassword(password);
    return legacyHash === storedValue;
  }

  // Format 3: Plain text (DEPRECATED - security risk)
  // Log warning but allow for migration purposes
  // TODO: Remove plain text support after all passwords are migrated
  console.error('SECURITY WARNING: Plain text password detected - must be migrated immediately');
  return password === storedValue;
}

/**
 * Legacy SHA-256 hash for backward compatibility
 * @deprecated Use hashPassword instead for new passwords
 * @param {string} password
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
async function legacyHashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if a stored value needs upgrading to new format
 * Returns true for:
 * - Legacy SHA-256 hashes (64 hex chars)
 * - Plain text passwords (anything else without a colon)
 *
 * @param {string} storedValue
 * @returns {boolean} True if value needs upgrading to PBKDF2
 */
export function needsHashUpgrade(storedValue) {
  if (!storedValue) return false;
  // New format has a colon separator - no upgrade needed
  if (storedValue.includes(':')) return false;
  // Everything else (SHA-256 hex or plain text) needs upgrade
  return true;
}
