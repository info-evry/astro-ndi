/**
 * Rate Limiting Tests
 * Verifies the RATE_LIMIT middleware enforces limits on public endpoints.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';

beforeAll(async () => {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', room TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);
});

describe('Rate limiting - POST /api/register', () => {
  it('returns 429 after exceeding the configured limit for a single IP', async () => {
    const ip = '203.0.113.42';
    let lastResponse;

    for (let i = 0; i < 6; i++) {
      lastResponse = await SELF.fetch('http://localhost/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': ip
        },
        body: JSON.stringify({
          createNewTeam: true,
          teamName: `Rate Limit Team ${i} ${Date.now()}`,
          teamPassword: 'testpass123',
          members: [{
            firstName: `RateLimit${i}`,
            lastName: 'User',
            email: `ratelimit${i}${Date.now()}@test.com`,
            bacLevel: 1,
            isLeader: true,
            foodDiet: ''
          }]
        })
      });
    }

    expect(lastResponse.status).toBe(429);
  });

  it('allows requests from different IPs independently', async () => {
    const response = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.7'
      },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: `Rate Limit Other IP ${Date.now()}`,
        teamPassword: 'testpass123',
        members: [{
          firstName: 'OtherIp',
          lastName: 'User',
          email: `otherip${Date.now()}@test.com`,
          bacLevel: 1,
          isLeader: true,
          foodDiet: ''
        }]
      })
    });

    expect(response.status).not.toBe(429);
  });
});
