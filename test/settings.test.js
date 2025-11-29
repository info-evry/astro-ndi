import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';

// Initialize database schema before tests
beforeAll(async () => {
  // Create teams table
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`);

  // Create members table
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);

  // Create settings table
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')))`);

  // Seed default settings
  await env.DB.exec(`INSERT OR IGNORE INTO settings (key, value, description) VALUES ('max_team_size', '15', 'Maximum members per team')`);
  await env.DB.exec(`INSERT OR IGNORE INTO settings (key, value, description) VALUES ('max_total_participants', '200', 'Maximum total participants')`);
  await env.DB.exec(`INSERT OR IGNORE INTO settings (key, value, description) VALUES ('min_team_size', '1', 'Minimum team size')`);
  await env.DB.exec(`INSERT OR IGNORE INTO settings (key, value, description) VALUES ('pizzas', '[{"id":"test","name":"Test Pizza","description":"A test pizza"}]', 'Pizza options')`);
  await env.DB.exec(`INSERT OR IGNORE INTO settings (key, value, description) VALUES ('bac_levels', '[{"value":0,"label":"Non bachelier"},{"value":1,"label":"BAC+1"}]', 'BAC levels')`);

  // Seed with Organisation team
  await env.DB.exec(`INSERT OR IGNORE INTO teams (name, description, password_hash) VALUES ('Organisation', 'Équipe organisatrice', '')`);
});

describe('GET /api/admin/settings', () => {
  it('should require authorization', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/settings');
    expect(response.status).toBe(401);
  });

  it('should return settings with valid authorization', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/settings', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.settings).toBeDefined();
    expect(data.settings.max_team_size).toBe('15');
    expect(data.settings.max_total_participants).toBe('200');
    expect(data.settings.min_team_size).toBe('1');
  });

  it('should parse JSON settings (pizzas, bac_levels)', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/settings', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const data = await response.json();
    expect(Array.isArray(data.settings.pizzas)).toBe(true);
    expect(Array.isArray(data.settings.bac_levels)).toBe(true);
    expect(data.settings.pizzas[0].id).toBe('test');
    expect(data.settings.bac_levels[0].value).toBe(0);
  });
});

describe('PUT /api/admin/settings', () => {
  it('should require authorization', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ max_team_size: 20 })
    });

    expect(response.status).toBe(401);
  });

  it('should update capacity settings', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        max_team_size: 20,
        max_total_participants: 300,
        min_team_size: 2
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.updated).toContain('max_team_size');

    // Verify the update
    const getResponse = await SELF.fetch('http://localhost/api/admin/settings', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });
    const getData = await getResponse.json();
    expect(getData.settings.max_team_size).toBe('20');
    expect(getData.settings.max_total_participants).toBe('300');
  });

  it('should update pizzas array', async () => {
    const newPizzas = [
      { id: 'margherita', name: 'Margherita', description: 'Classic' },
      { id: 'pepperoni', name: 'Pepperoni', description: 'Spicy' }
    ];

    const response = await SELF.fetch('http://localhost/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ pizzas: newPizzas })
    });

    expect(response.status).toBe(200);

    // Verify the update
    const getResponse = await SELF.fetch('http://localhost/api/admin/settings', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });
    const getData = await getResponse.json();
    expect(getData.settings.pizzas).toHaveLength(2);
    expect(getData.settings.pizzas[0].id).toBe('margherita');
  });

  it('should reject invalid setting keys', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ invalid_key: 'value' })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid setting keys');
  });

  it('should validate max_team_size range', async () => {
    // Too high
    const response1 = await SELF.fetch('http://localhost/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ max_team_size: 500 })
    });

    expect(response1.status).toBe(400);
    const data1 = await response1.json();
    expect(data1.error).toContain('max_team_size');

    // Zero
    const response2 = await SELF.fetch('http://localhost/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ max_team_size: 0 })
    });

    expect(response2.status).toBe(400);
  });

  it('should validate pizzas array structure', async () => {
    // Not an array
    const response1 = await SELF.fetch('http://localhost/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ pizzas: 'not an array' })
    });

    expect(response1.status).toBe(400);

    // Missing id
    const response2 = await SELF.fetch('http://localhost/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ pizzas: [{ name: 'No ID' }] })
    });

    expect(response2.status).toBe(400);

    // Missing name
    const response3 = await SELF.fetch('http://localhost/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ pizzas: [{ id: 'no-name' }] })
    });

    expect(response3.status).toBe(400);
  });
});

describe('Config uses D1 settings', () => {
  it('should use pizzas from settings table', async () => {
    // First update the pizzas in settings
    await SELF.fetch('http://localhost/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        pizzas: [
          { id: 'custom1', name: 'Custom Pizza 1', description: 'Test 1' },
          { id: 'custom2', name: 'Custom Pizza 2', description: 'Test 2' }
        ]
      })
    });

    // Now check the config endpoint
    const configResponse = await SELF.fetch('http://localhost/api/config');
    expect(configResponse.status).toBe(200);

    const configData = await configResponse.json();
    expect(configData.config.pizzas).toBeDefined();
    expect(configData.config.pizzas[0].id).toBe('custom1');
    expect(configData.config.pizzas[1].id).toBe('custom2');
  });

  it('should use capacity settings from D1', async () => {
    // Update capacity settings
    await SELF.fetch('http://localhost/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        max_team_size: 25,
        max_total_participants: 500,
        min_team_size: 3
      })
    });

    // Check config endpoint
    const configResponse = await SELF.fetch('http://localhost/api/config');
    const configData = await configResponse.json();

    expect(configData.config.maxTeamSize).toBe(25);
    expect(configData.config.maxTotalParticipants).toBe(500);
    expect(configData.config.minTeamSize).toBe(3);
  });
});
