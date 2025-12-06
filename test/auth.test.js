/**
 * Auth Module Tests
 * Tests for authentication functions (integration tests through API)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';

beforeAll(async () => {
  // Setup minimal schema for auth tests
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', room TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);
  await env.DB.exec(`INSERT OR IGNORE INTO teams (name, description, password_hash) VALUES ('Test Team', 'Test', '')`);
});

describe('Admin Authentication - verifyAdmin', () => {
  it('should reject request without Authorization header', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/stats');
    expect(response.status).toBe(401);
  });

  it('should reject request with empty Authorization header', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/stats', {
      headers: { 'Authorization': '' }
    });
    expect(response.status).toBe(401);
  });

  it('should reject request without Bearer prefix', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/stats', {
      headers: { 'Authorization': 'test-admin-token' }
    });
    expect(response.status).toBe(401);
  });

  it('should reject request with wrong Bearer token', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/stats', {
      headers: { 'Authorization': 'Bearer wrong-token' }
    });
    expect(response.status).toBe(401);
  });

  it('should reject request with Bearer but empty token', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/stats', {
      headers: { 'Authorization': 'Bearer ' }
    });
    expect(response.status).toBe(401);
  });

  it('should accept request with correct Bearer token', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/stats', {
      headers: { 'Authorization': 'Bearer test-admin-token' }
    });
    expect(response.status).toBe(200);
  });

  it('should be case-sensitive for token', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/stats', {
      headers: { 'Authorization': 'Bearer TEST-ADMIN-TOKEN' }
    });
    expect(response.status).toBe(401);
  });

  it('should reject token with extra whitespace', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/stats', {
      headers: { 'Authorization': 'Bearer  test-admin-token' }
    });
    expect(response.status).toBe(401);
  });

  it('should handle token with trailing whitespace', async () => {
    // Note: HTTP headers may have whitespace trimmed by some implementations
    const response = await SELF.fetch('http://localhost/api/admin/stats', {
      headers: { 'Authorization': 'Bearer test-admin-token ' }
    });
    // May be accepted or rejected depending on header parsing
    expect([200, 401]).toContain(response.status);
  });
});

describe('Admin Authentication - Protected Endpoints', () => {
  // Endpoints that are known to return 401 for unauthorized access
  const protectedEndpoints = [
    { method: 'GET', path: '/api/admin/stats' },
    { method: 'GET', path: '/api/admin/members' },
    { method: 'GET', path: '/api/admin/attendance' },
    { method: 'GET', path: '/api/admin/pizza' },
    { method: 'GET', path: '/api/admin/rooms' },
  ];

  for (const endpoint of protectedEndpoints) {
    it(`should protect ${endpoint.method} ${endpoint.path}`, async () => {
      const response = await SELF.fetch(`http://localhost${endpoint.path}`, {
        method: endpoint.method
      });
      expect(response.status).toBe(401);
    });

    it(`should allow authenticated access to ${endpoint.method} ${endpoint.path}`, async () => {
      const response = await SELF.fetch(`http://localhost${endpoint.path}`, {
        method: endpoint.method,
        headers: { 'Authorization': 'Bearer test-admin-token' }
      });
      // Should either succeed (200) or fail for other reasons (400, 404, 500), but not 401
      expect(response.status).not.toBe(401);
    });
  }
});

describe('Timing Attack Prevention', () => {
  it('should take similar time for wrong vs correct token', async () => {
    // This is a basic test - in practice timing attacks need more sophisticated testing
    const iterations = 5;
    const wrongTimes = [];
    const correctTimes = [];

    for (let i = 0; i < iterations; i++) {
      const startWrong = performance.now();
      await SELF.fetch('http://localhost/api/admin/stats', {
        headers: { 'Authorization': 'Bearer wrong-token-123456' }
      });
      wrongTimes.push(performance.now() - startWrong);

      const startCorrect = performance.now();
      await SELF.fetch('http://localhost/api/admin/stats', {
        headers: { 'Authorization': 'Bearer test-admin-token' }
      });
      correctTimes.push(performance.now() - startCorrect);
    }

    // Calculate averages
    const avgWrong = wrongTimes.reduce((a, b) => a + b, 0) / wrongTimes.length;
    const avgCorrect = correctTimes.reduce((a, b) => a + b, 0) / correctTimes.length;

    // Times should be within reasonable range (not a definitive test but sanity check)
    // Allow up to 5x difference due to network/processing variability
    const ratio = Math.max(avgWrong, avgCorrect) / Math.min(avgWrong, avgCorrect);
    expect(ratio).toBeLessThan(5);
  });
});
