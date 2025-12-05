/**
 * Pizza Distribution API Tests
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const ADMIN_TOKEN = 'test-admin-token';

beforeAll(async () => {
  // Create schema with pizza tracking fields
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', checked_in INTEGER DEFAULT 0, checked_in_at TEXT DEFAULT NULL, pizza_received INTEGER DEFAULT 0, pizza_received_at TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')))`);
});

beforeEach(async () => {
  // Clean up data before each test
  await env.DB.exec(`DELETE FROM members`);
  await env.DB.exec(`DELETE FROM teams`);

  // Create test team and members with pizza types
  await env.DB.exec(`INSERT INTO teams (id, name, description) VALUES (1, 'Test Team', 'A test team')`);
  await env.DB.exec(`INSERT INTO teams (id, name, description) VALUES (2, 'Organisation', 'Organisers')`);
  await env.DB.exec(`INSERT INTO members (id, team_id, first_name, last_name, email, bac_level, food_diet, checked_in) VALUES (1, 1, 'Alice', 'Smith', 'alice@example.com', 3, 'margherita', 1)`);
  await env.DB.exec(`INSERT INTO members (id, team_id, first_name, last_name, email, bac_level, food_diet, checked_in) VALUES (2, 1, 'Bob', 'Jones', 'bob@example.com', 2, '4fromages', 1)`);
  await env.DB.exec(`INSERT INTO members (id, team_id, first_name, last_name, email, bac_level, food_diet, checked_in) VALUES (3, 1, 'Charlie', 'Brown', 'charlie@example.com', 4, 'margherita', 0)`);
  await env.DB.exec(`INSERT INTO members (id, team_id, first_name, last_name, email, bac_level, food_diet, checked_in) VALUES (4, 2, 'Diana', 'Org', 'diana@example.com', 5, 'vegetarienne', 1)`);
});

describe('GET /api/admin/pizza', () => {
  it('should require admin authentication', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/pizza', {
      method: 'GET'
    });

    expect(response.status).toBe(401);
  });

  it('should return all members with pizza status including Organisation', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/pizza', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.members).toHaveLength(4); // Includes Organisation member
    expect(data.stats).toBeDefined();
    expect(data.stats.total).toBe(4); // Includes Organisation member
    expect(data.stats.received).toBe(0);
    expect(data.stats.pending).toBe(4);

    // Verify Organisation member is included
    const orgMember = data.members.find(m => m.team_name === 'Organisation');
    expect(orgMember).toBeDefined();
    expect(orgMember.first_name).toBe('Diana');
  });

  it('should include pizza fields in member data', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/pizza', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();
    const member = data.members[0];

    expect(member).toHaveProperty('pizza_received');
    expect(member).toHaveProperty('pizza_received_at');
    expect(member).toHaveProperty('food_diet');
    expect(member).toHaveProperty('team_name');
    expect(member.pizza_received).toBe(0);
    expect(member.pizza_received_at).toBeNull();
  });

  it('should include stats by pizza type', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/pizza', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    expect(data.stats.by_type).toBeDefined();
    expect(Array.isArray(data.stats.by_type)).toBe(true);

    // Should have 3 pizza types: margherita (2), 4fromages (1), vegetarienne (1)
    expect(data.stats.by_type.length).toBe(3);
    const margherita = data.stats.by_type.find(t => t.food_diet === 'margherita');
    expect(margherita).toBeDefined();
    expect(margherita.total).toBe(2);
  });
});

describe('POST /api/admin/pizza/give/:id', () => {
  it('should require admin authentication', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/pizza/give/1', {
      method: 'POST',
      headers: { 'Origin': 'http://localhost' }
    });

    expect(response.status).toBe(401);
  });

  it('should give pizza to a member', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/pizza/give/1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.member.pizza_received).toBe(1);
    expect(data.member.pizza_received_at).toBeTruthy();
  });

  it('should return 404 for non-existent member', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/pizza/give/999', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    expect(response.status).toBe(404);
  });

  it('should update pizza stats after giving pizza', async () => {
    // Give pizza to a member
    await SELF.fetch('http://localhost/api/admin/pizza/give/1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    // Get updated stats
    const response = await SELF.fetch('http://localhost/api/admin/pizza', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    expect(data.stats.received).toBe(1);
    expect(data.stats.pending).toBe(3);
  });

  it('should update stats by type after giving pizza', async () => {
    // Give pizza to Alice (margherita)
    await SELF.fetch('http://localhost/api/admin/pizza/give/1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    const response = await SELF.fetch('http://localhost/api/admin/pizza', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();
    const margherita = data.stats.by_type.find(t => t.food_diet === 'margherita');

    expect(margherita.received).toBe(1);
    expect(margherita.total).toBe(2);
  });
});

describe('POST /api/admin/pizza/revoke/:id', () => {
  it('should require admin authentication', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/pizza/revoke/1', {
      method: 'POST',
      headers: { 'Origin': 'http://localhost' }
    });

    expect(response.status).toBe(401);
  });

  it('should revoke pizza from a member (undo)', async () => {
    // First give pizza
    await SELF.fetch('http://localhost/api/admin/pizza/give/1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    // Then revoke
    const response = await SELF.fetch('http://localhost/api/admin/pizza/revoke/1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.member.pizza_received).toBe(0);
    expect(data.member.pizza_received_at).toBeNull();
  });

  it('should return 404 for non-existent member', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/pizza/revoke/999', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    expect(response.status).toBe(404);
  });
});

describe('POST /api/admin/pizza/give-batch', () => {
  it('should require admin authentication', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/pizza/give-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberIds: [1, 2] })
    });

    expect(response.status).toBe(401);
  });

  it('should give pizza to multiple members', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/pizza/give-batch', {
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
    expect(data.given).toBe(3);

    // Verify stats
    const statsResponse = await SELF.fetch('http://localhost/api/admin/pizza', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    const statsData = await statsResponse.json();
    expect(statsData.stats.received).toBe(3);
    expect(statsData.stats.pending).toBe(1); // Organisation member
  });

  it('should require memberIds array', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/pizza/give-batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
  });

  it('should reject empty memberIds array', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/pizza/give-batch', {
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

describe('POST /api/admin/pizza/revoke-batch', () => {
  it('should require admin authentication', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/pizza/revoke-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberIds: [1, 2] })
    });

    expect(response.status).toBe(401);
  });

  it('should revoke pizza from multiple members', async () => {
    // First give pizza to all
    await SELF.fetch('http://localhost/api/admin/pizza/give-batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ memberIds: [1, 2, 3, 4] })
    });

    // Then revoke from some
    const response = await SELF.fetch('http://localhost/api/admin/pizza/revoke-batch', {
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
    expect(data.revoked).toBe(2);

    // Verify stats
    const statsResponse = await SELF.fetch('http://localhost/api/admin/pizza', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    const statsData = await statsResponse.json();
    expect(statsData.stats.received).toBe(2); // 3 and 4 still have pizza
    expect(statsData.stats.pending).toBe(2); // 1 and 2 revoked
  });

  it('should require memberIds array', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/pizza/revoke-batch', {
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

describe('Pizza Distribution Workflow', () => {
  it('should handle complete pizza distribution workflow', async () => {
    // Initial state - no one has pizza
    let response = await SELF.fetch('http://localhost/api/admin/pizza', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    let data = await response.json();
    expect(data.stats.received).toBe(0);
    expect(data.stats.total).toBe(4);

    // Give pizza to member 1
    await SELF.fetch('http://localhost/api/admin/pizza/give/1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    // Check stats
    response = await SELF.fetch('http://localhost/api/admin/pizza', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    data = await response.json();
    expect(data.stats.received).toBe(1);

    // Batch give to remaining members
    await SELF.fetch('http://localhost/api/admin/pizza/give-batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ memberIds: [2, 3, 4] })
    });

    // All have pizza
    response = await SELF.fetch('http://localhost/api/admin/pizza', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    data = await response.json();
    expect(data.stats.received).toBe(4);
    expect(data.stats.pending).toBe(0);

    // Revoke one (mistake)
    await SELF.fetch('http://localhost/api/admin/pizza/revoke/2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    // Final state
    response = await SELF.fetch('http://localhost/api/admin/pizza', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    data = await response.json();
    expect(data.stats.received).toBe(3);
    expect(data.stats.pending).toBe(1);
  });

  it('should preserve pizza received timestamp', async () => {
    // Give pizza to a member
    await SELF.fetch('http://localhost/api/admin/pizza/give/1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Origin': 'http://localhost'
      }
    });

    // Get member data
    const response = await SELF.fetch('http://localhost/api/admin/pizza', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    const data = await response.json();
    const member = data.members.find(m => m.id === 1);

    expect(member.pizza_received).toBe(1);
    expect(member.pizza_received_at).toBeTruthy();

    // Verify it's a valid ISO timestamp
    const timestamp = new Date(member.pizza_received_at);
    expect(timestamp.getTime()).toBeGreaterThan(0);
  });

  it('should include checked_in status with pizza data', async () => {
    // Get pizza data which should include checked_in info
    const response = await SELF.fetch('http://localhost/api/admin/pizza', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    const data = await response.json();

    // Member 1 is checked in
    const checkedInMember = data.members.find(m => m.id === 1);
    expect(checkedInMember.checked_in).toBe(1);

    // Member 3 is not checked in
    const notCheckedInMember = data.members.find(m => m.id === 3);
    expect(notCheckedInMember.checked_in).toBe(0);
  });
});
