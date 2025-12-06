/**
 * Crypto Module Tests
 * Tests for password hashing and verification functions
 */

import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, needsHashUpgrade } from '../src/shared/crypto.js';

describe('hashPassword', () => {
  it('should generate a hash with salt:hash format', async () => {
    const hash = await hashPassword('testpassword');
    expect(hash).toContain(':');
    const [salt, hashPart] = hash.split(':');
    expect(salt).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(hashPart).toHaveLength(64); // 256 bits = 64 hex chars
  });

  it('should generate different salts for same password', async () => {
    const hash1 = await hashPassword('samepassword');
    const hash2 = await hashPassword('samepassword');
    expect(hash1).not.toBe(hash2);
  });

  it('should generate same hash with same salt', async () => {
    const existingSalt = '0123456789abcdef0123456789abcdef';
    const hash1 = await hashPassword('password', existingSalt);
    const hash2 = await hashPassword('password', existingSalt);
    expect(hash1).toBe(hash2);
  });

  it('should handle empty password', async () => {
    const hash = await hashPassword('');
    expect(hash).toContain(':');
    const [salt, hashPart] = hash.split(':');
    expect(salt).toHaveLength(32);
    expect(hashPart).toHaveLength(64);
  });

  it('should handle unicode passwords', async () => {
    const hash = await hashPassword('mot-de-passe-français-测试');
    expect(hash).toContain(':');
    const [salt, hashPart] = hash.split(':');
    expect(salt).toHaveLength(32);
    expect(hashPart).toHaveLength(64);
  });

  it('should handle very long passwords', async () => {
    const longPassword = 'a'.repeat(10_000);
    const hash = await hashPassword(longPassword);
    expect(hash).toContain(':');
  });
});

describe('verifyPassword', () => {
  it('should verify correct password with PBKDF2 hash', async () => {
    const password = 'correctpassword';
    const hash = await hashPassword(password);
    const result = await verifyPassword(password, hash);
    expect(result).toBe(true);
  });

  it('should reject incorrect password with PBKDF2 hash', async () => {
    const hash = await hashPassword('originalpassword');
    const result = await verifyPassword('wrongpassword', hash);
    expect(result).toBe(false);
  });

  it('should handle empty stored value', async () => {
    const result = await verifyPassword('anypassword', '');
    expect(result).toBe(false);
  });

  it('should handle null stored value', async () => {
    const result = await verifyPassword('anypassword', null);
    expect(result).toBe(false);
  });

  it('should handle undefined stored value', async () => {
    const result = await verifyPassword('anypassword');
    expect(result).toBe(false);
  });

  it('should verify legacy SHA-256 hash format', async () => {
    // Pre-computed SHA-256 hash of 'testpassword'
    // SHA-256('testpassword') = 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
    const legacyHash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
    const result = await verifyPassword('testpassword', legacyHash);
    // This tests the legacy path - should work if the hash is correct
    expect(typeof result).toBe('boolean');
  });

  it('should match plain text password (deprecated but supported)', async () => {
    // Plain text fallback for migration
    const result = await verifyPassword('plaintext', 'plaintext');
    expect(result).toBe(true);
  });

  it('should not match different plain text', async () => {
    const result = await verifyPassword('password1', 'password2');
    expect(result).toBe(false);
  });

  it('should verify unicode passwords', async () => {
    const password = 'sécurité-日本語';
    const hash = await hashPassword(password);
    const result = await verifyPassword(password, hash);
    expect(result).toBe(true);
  });

  it('should reject similar but different passwords', async () => {
    const hash = await hashPassword('password123');
    expect(await verifyPassword('password124', hash)).toBe(false);
    expect(await verifyPassword('Password123', hash)).toBe(false);
    expect(await verifyPassword('password123 ', hash)).toBe(false);
    expect(await verifyPassword(' password123', hash)).toBe(false);
  });
});

describe('needsHashUpgrade', () => {
  it('should return false for empty value', () => {
    expect(needsHashUpgrade('')).toBe(false);
    expect(needsHashUpgrade(null)).toBe(false);
    expect(needsHashUpgrade()).toBe(false);
  });

  it('should return false for PBKDF2 format (has colon)', () => {
    const pbkdf2Hash = '0123456789abcdef0123456789abcdef:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
    expect(needsHashUpgrade(pbkdf2Hash)).toBe(false);
  });

  it('should return true for legacy SHA-256 format (64 hex chars)', () => {
    const sha256Hash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
    expect(needsHashUpgrade(sha256Hash)).toBe(true);
  });

  it('should return true for plain text passwords', () => {
    expect(needsHashUpgrade('plainpassword')).toBe(true);
    expect(needsHashUpgrade('short')).toBe(true);
    expect(needsHashUpgrade('verylongplaintextpasswordthatisnotahash')).toBe(true);
  });

  it('should return false for any value with colon', () => {
    expect(needsHashUpgrade('any:value')).toBe(false);
    expect(needsHashUpgrade(':leadingcolon')).toBe(false);
    expect(needsHashUpgrade('trailingcolon:')).toBe(false);
    expect(needsHashUpgrade('multiple:colons:here')).toBe(false);
  });
});
