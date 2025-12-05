/**
 * Attendance API Tests
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const ADMIN_TOKEN = 'test-admin-token';

beforeAll(async () => {
  // Create schema with attendance fields and payment tracking
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', checked_in INTEGER DEFAULT 0, checked_in_at TEXT DEFAULT NULL, payment_tier TEXT DEFAULT NULL, payment_amount INTEGER DEFAULT NULL, payment_confirmed_at TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')))`);
});

beforeEach(async () => {
  // Clean up data before each test
  await env.DB.exec(`DELETE FROM members`);
  await env.DB.exec(`DELETE FROM teams`);

  // Create test team and members
  await env.DB.exec(`INSERT INTO teams (id, name, description) VALUES (1, 'Test Team', 'A test team')`);
  await env.DB.exec(`INSERT INTO teams (id, name, description) VALUES (2, 'Organisation', 'Organisers')`);
  await env.DB.exec(`INSERT INTO members (id, team_id, first_name, last_name, email, bac_level) VALUES (1, 1, 'Alice', 'Smith', 'alice@example.com', 3)`);
  await env.DB.exec(`INSERT INTO members (id, team_id, first_name, last_name, email, bac_level) VALUES (2, 1, 'Bob', 'Jones', 'bob@example.com', 2)`);
  await env.DB.exec(`INSERT INTO members (id, team_id, first_name, last_name, email, bac_level) VALUES (3, 1, 'Charlie', 'Brown', 'charlie@example.com', 4)`);
  await env.DB.exec(`INSERT INTO members (id, team_id, first_name, last_name, email, bac_level) VALUES (4, 2, 'Diana', 'Org', 'diana@example.com', 5)`);
});

describe('GET /api/admin/attendance', () => {
  it('should require admin authentication', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/attendance', {
      method: 'GET'
    });

    expect(response.status).toBe(401);
  });

  it('should return all members with attendance status including Organisation', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/attendance', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.members).toHaveLength(4); // Includes Organisation member
    expect(data.stats).toBeDefined();
    expect(data.stats.total).toBe(4); // Includes Organisation member
    expect(data.stats.checked_in).toBe(0);
    expect(data.stats.not_checked_in).toBe(4);

    // Verify Organisation member is included
    const orgMember = data.members.find(m => m.team_name === 'Organisation');
    expect(orgMember).toBeDefined();
    expect(orgMember.first_name).toBe('Diana');
  });

  it('should include attendance fields in member data', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/attendance', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();
    const member = data.members[0];

    expect(member).toHaveProperty('checked_in');
    expect(member).toHaveProperty('checked_in_at');
    expect(member).toHaveProperty('team_name');
    expect(member.checked_in).toBe(0);
    expect(member.checked_in_at).toBeNull();
  });
});

describe('POST /api/admin/attendance/check-in/:id', () => {
  it('should require admin authentication', async () => {
    // Include Origin to pass CSRF check, but no auth token
    const response = await SELF.fetch('http://localhost/api/admin/attendance/check-in/1', {
      method: 'POST',
      headers: { 'Origin': 'http://localhost' }
    });

    expect(response.status).toBe(401);
  });

  it('should check in a member', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/attendance/check-in/1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.member.checked_in).toBe(1);
    expect(data.member.checked_in_at).toBeTruthy();
  });

  it('should return 404 for non-existent member', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/attendance/check-in/999', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    expect(response.status).toBe(404);
  });

  it('should update attendance stats after check-in', async () => {
    // Check in a member
    await SELF.fetch('http://localhost/api/admin/attendance/check-in/1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    // Get updated stats
    const response = await SELF.fetch('http://localhost/api/admin/attendance', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    expect(data.stats.checked_in).toBe(1);
    expect(data.stats.not_checked_in).toBe(3); // 4 total - 1 checked in = 3 not checked in
  });
});

describe('POST /api/admin/attendance/check-out/:id', () => {
  it('should require admin authentication', async () => {
    // Include Origin to pass CSRF check, but no auth token
    const response = await SELF.fetch('http://localhost/api/admin/attendance/check-out/1', {
      method: 'POST',
      headers: { 'Origin': 'http://localhost' }
    });

    expect(response.status).toBe(401);
  });

  it('should check out a member (revoke attendance)', async () => {
    // First check in
    await SELF.fetch('http://localhost/api/admin/attendance/check-in/1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    // Then check out
    const response = await SELF.fetch('http://localhost/api/admin/attendance/check-out/1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.member.checked_in).toBe(0);
    expect(data.member.checked_in_at).toBeNull();
  });

  it('should return 404 for non-existent member', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/attendance/check-out/999', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    expect(response.status).toBe(404);
  });
});

describe('POST /api/admin/attendance/check-in-batch', () => {
  it('should require admin authentication', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/attendance/check-in-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberIds: [1, 2] })
    });

    expect(response.status).toBe(401);
  });

  it('should check in multiple members', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/attendance/check-in-batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ memberIds: [1, 2, 3] })
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.checked_in).toBe(3);

    // Verify 3 are checked in (Organisation member still not checked in)
    const statsResponse = await SELF.fetch('http://localhost/api/admin/attendance', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    const statsData = await statsResponse.json();
    expect(statsData.stats.checked_in).toBe(3);
    expect(statsData.stats.not_checked_in).toBe(1); // Organisation member
  });

  it('should require memberIds array', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/attendance/check-in-batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
  });
});

describe('POST /api/admin/attendance/check-out-batch', () => {
  it('should require admin authentication', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/attendance/check-out-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberIds: [1, 2] })
    });

    expect(response.status).toBe(401);
  });

  it('should check out multiple members', async () => {
    // First check in some members (not including Organisation member)
    await SELF.fetch('http://localhost/api/admin/attendance/check-in-batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ memberIds: [1, 2, 3] })
    });

    // Then check out some
    const response = await SELF.fetch('http://localhost/api/admin/attendance/check-out-batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ memberIds: [1, 2] })
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.checked_out).toBe(2);

    // Verify stats (1 checked in + 3 not checked in including Organisation member)
    const statsResponse = await SELF.fetch('http://localhost/api/admin/attendance', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    const statsData = await statsResponse.json();
    expect(statsData.stats.checked_in).toBe(1);
    expect(statsData.stats.not_checked_in).toBe(3); // 2 checked out + 1 Organisation member
  });

  it('should require memberIds array', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/attendance/check-out-batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ memberIds: [] })
    });

    expect(response.status).toBe(400);
  });
});

describe('Attendance Workflow', () => {
  it('should handle complete check-in/check-out workflow including Organisation members', async () => {
    // Initial state - no one checked in (4 members total including Organisation)
    let response = await SELF.fetch('http://localhost/api/admin/attendance', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    let data = await response.json();
    expect(data.stats.checked_in).toBe(0);
    expect(data.stats.total).toBe(4); // Includes Organisation member

    // Check in member 1
    await SELF.fetch('http://localhost/api/admin/attendance/check-in/1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    // Check stats
    response = await SELF.fetch('http://localhost/api/admin/attendance', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    data = await response.json();
    expect(data.stats.checked_in).toBe(1);

    // Batch check in remaining Test Team members (not Organisation member)
    await SELF.fetch('http://localhost/api/admin/attendance/check-in-batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ memberIds: [2, 3] })
    });

    // 3 Test Team members checked in, Organisation member not checked in
    response = await SELF.fetch('http://localhost/api/admin/attendance', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    data = await response.json();
    expect(data.stats.checked_in).toBe(3);
    expect(data.stats.not_checked_in).toBe(1); // Organisation member

    // Check in Organisation member too
    await SELF.fetch('http://localhost/api/admin/attendance/check-in/4', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    // All 4 members checked in
    response = await SELF.fetch('http://localhost/api/admin/attendance', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    data = await response.json();
    expect(data.stats.checked_in).toBe(4);
    expect(data.stats.not_checked_in).toBe(0);

    // Check out one member (mistake)
    await SELF.fetch('http://localhost/api/admin/attendance/check-out/2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    // Final state
    response = await SELF.fetch('http://localhost/api/admin/attendance', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    data = await response.json();
    expect(data.stats.checked_in).toBe(3);
    expect(data.stats.not_checked_in).toBe(1);
  });

  it('should preserve check-in timestamp', async () => {
    // Check in a member
    await SELF.fetch('http://localhost/api/admin/attendance/check-in/1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    // Get member data
    const response = await SELF.fetch('http://localhost/api/admin/attendance', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    const data = await response.json();
    const member = data.members.find(m => m.id === 1);

    expect(member.checked_in).toBe(1);
    expect(member.checked_in_at).toBeTruthy();

    // Verify it's a valid ISO timestamp
    const timestamp = new Date(member.checked_in_at);
    expect(timestamp.getTime()).toBeGreaterThan(0);
  });
});
