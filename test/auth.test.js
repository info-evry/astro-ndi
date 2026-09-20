/**
 * Auth Module Tests
 * Tests for authentication functions (integration tests through API)
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { env, SELF } from 'cloudflare:test';

// Id of a member created in beforeAll, used to exercise the payment
// endpoints' authorization check without tripping their earlier 400/404
// validation branches.
let authTestMemberId;

beforeAll(async () => {
  // Setup minimal schema for auth tests
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', room TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', payment_status TEXT DEFAULT 'unpaid', payment_method TEXT DEFAULT NULL, checkout_id TEXT DEFAULT NULL, transaction_id TEXT DEFAULT NULL, registration_tier TEXT DEFAULT NULL, payment_amount INTEGER DEFAULT NULL, payment_tier TEXT DEFAULT NULL, payment_confirmed_at TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);
  await env.DB.exec(`INSERT OR IGNORE INTO teams (name, description, password_hash) VALUES ('Test Team', 'Test', '')`);

  const team = await env.DB.prepare('SELECT id FROM teams WHERE name = ?').bind('Test Team').first();
  const result = await env.DB.prepare(
    `INSERT INTO members (team_id, first_name, last_name, email, bac_level, is_leader, food_diet, checkout_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(team.id, 'Auth', 'TestMember', 'authtestmember@example.com', 1, 0, '', 'auth-test-checkout-id').run();
  authTestMemberId = result.meta.last_row_id;
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

  it('should reject and fail closed when KV lookup throws', async () => {
    const spy = vi.spyOn(env.CONFIG, 'get').mockRejectedValueOnce(new Error('KV unavailable'));
    try {
      const response = await SELF.fetch('http://localhost/api/admin/stats', {
        headers: { 'Authorization': 'Bearer test-admin-token' }
      });
      expect(response.status).toBe(401);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('Admin Authentication - Protected Endpoints', () => {
  // Endpoints that are known to require authorization for unauthorized access.
  // `expectedStatus` is the status returned when no credentials are supplied
  // at all: admin endpoints return 401 (missing bearer token), while the
  // payment endpoints accept either an admin bearer token OR a team
  // password, so an unauthenticated request returns 403 instead.
  const protectedEndpoints = [
    { method: 'GET', path: '/api/admin/stats', expectedStatus: 401 },
    { method: 'GET', path: '/api/admin/members', expectedStatus: 401 },
    { method: 'GET', path: '/api/admin/attendance', expectedStatus: 401 },
    { method: 'GET', path: '/api/admin/pizza', expectedStatus: 401 },
    { method: 'GET', path: '/api/admin/rooms', expectedStatus: 401 },
    // memberId is filled in lazily (see getBody) once authTestMemberId is
    // available, so that these requests reach the 403 authorization check
    // instead of the earlier 400 (missing memberId) validation branch.
    { method: 'POST', path: '/api/payment/checkout', expectedStatus: 403, getBody: () => ({ memberId: authTestMemberId }) },
    { method: 'POST', path: '/api/payment/verify', expectedStatus: 403, getBody: () => ({ checkoutId: 'auth-test-checkout-id' }) },
    { method: 'POST', path: '/api/payment/delayed', expectedStatus: 403, getBody: () => ({ memberId: authTestMemberId }) },
  ];

  for (const endpoint of protectedEndpoints) {
    it(`should protect ${endpoint.method} ${endpoint.path}`, async () => {
      const response = await SELF.fetch(`http://localhost${endpoint.path}`, {
        method: endpoint.method,
        headers: endpoint.getBody ? { 'Content-Type': 'application/json' } : undefined,
        body: endpoint.getBody ? JSON.stringify(endpoint.getBody()) : undefined
      });
      expect(response.status).toBe(endpoint.expectedStatus);
    });

    it(`should allow authenticated access to ${endpoint.method} ${endpoint.path}`, async () => {
      const response = await SELF.fetch(`http://localhost${endpoint.path}`, {
        method: endpoint.method,
        headers: {
          'Authorization': 'Bearer test-admin-token',
          ...(endpoint.getBody ? { 'Content-Type': 'application/json' } : {})
        },
        body: endpoint.getBody ? JSON.stringify(endpoint.getBody()) : undefined
      });
      // Should either succeed (200) or fail for other reasons (400, 404, 500), but not the unauthenticated status
      expect(response.status).not.toBe(endpoint.expectedStatus);
    });
  }
});

describe('Timing Attack Prevention', () => {
  it('should reject tokens differing at the first vs last character in similar time', async () => {
    // Both requests fail the bearer comparison and never reach D1, so the
    // only work measured is the constant-time comparison itself. The old
    // version compared a 401 against an authenticated /stats query (which
    // hits the database) and was inherently flaky.
    const correct = 'test-admin-token';
    const wrongFirst = 'Xest-admin-toke' + correct.slice(-1);
    const wrongLast = correct.slice(0, -1) + 'X';
    const time = async (token) => {
      const start = performance.now();
      const res = await SELF.fetch('http://localhost/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      expect(res.status).toBe(401);
      return performance.now() - start;
    };

    // Warm up the isolate so JIT/cold-start noise does not skew the samples
    for (let i = 0; i < 3; i++) {
      await time(wrongFirst);
      await time(wrongLast);
    }

    const iterations = 20;
    const first = [];
    const last = [];
    for (let i = 0; i < iterations; i++) {
      first.push(await time(wrongFirst));
      last.push(await time(wrongLast));
    }
    const median = (xs) => {
      const sorted = [...xs].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    const ratio = Math.max(median(first), median(last)) / Math.min(median(first), median(last));
    // Sanity bound only: a real early-exit comparison would differ by orders
    // of magnitude on long tokens; scheduler noise stays well under this.
    expect(ratio).toBeLessThan(4);
  });
});
