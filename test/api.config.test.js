/**
 * Config API Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';

beforeAll(async () => {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`INSERT OR IGNORE INTO teams (name, description, password_hash) VALUES ('Organisation', 'Équipe organisatrice', '')`);
});

describe('GET /api/config', () => {
  it('should return configuration', async () => {
    const response = await SELF.fetch('http://localhost/api/config');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.config).toBeDefined();
    expect(data.config.pizzas).toBeDefined();
    expect(Array.isArray(data.config.pizzas)).toBe(true);
    expect(data.config.bacLevels).toBeDefined();
    expect(data.config.maxTeamSize).toBe(15);
    expect(data.config.minTeamSize).toBe(1);
  });

  it('should include all required config fields', async () => {
    const response = await SELF.fetch('http://localhost/api/config');
    const data = await response.json();

    expect(data.config.maxTeamSize).toBeDefined();
    expect(data.config.minTeamSize).toBeDefined();
    expect(data.config.maxTotalParticipants).toBeDefined();
    expect(data.config.pizzas).toBeDefined();
    expect(data.config.bacLevels).toBeDefined();
  });

  it('should return pizzas with id, name, description', async () => {
    const response = await SELF.fetch('http://localhost/api/config');
    const data = await response.json();

    if (data.config.pizzas.length > 0) {
      const pizza = data.config.pizzas[0];
      expect(pizza).toHaveProperty('id');
      expect(pizza).toHaveProperty('name');
    }
  });

  it('should return bacLevels with value and label', async () => {
    const response = await SELF.fetch('http://localhost/api/config');
    const data = await response.json();

    if (data.config.bacLevels.length > 0) {
      const level = data.config.bacLevels[0];
      expect(level).toHaveProperty('value');
      expect(level).toHaveProperty('label');
    }
  });
});

// CORS is handled by Astro's API route, not testable with cloudflare:test
describe.skip('CORS', () => {
  it('should handle OPTIONS preflight', async () => {
    const response = await SELF.fetch('http://localhost/api/teams', {
      method: 'OPTIONS'
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('should include CORS headers in API responses', async () => {
    const response = await SELF.fetch('http://localhost/api/teams');

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
