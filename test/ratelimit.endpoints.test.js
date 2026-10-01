/**
 * Rate limits per endpoint group (register, team view, admin API).
 * test/setup.js clears the RATE_LIMIT namespace before every test, and
 * requests without CF-Connecting-IP share the client IP "unknown".
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { setupSchema, seedTeam, postJson, BASE } from './helpers.js';

beforeAll(setupSchema);
afterEach(() => vi.restoreAllMocks());

const asIp = (ip) => ({ 'CF-Connecting-IP': ip });

describe('Admin API rate limit (60 requests / minute)', () => {
  it('answers 429 on the 61st request, whatever the outcome of the earlier ones', async () => {
    const statuses = [];
    for (let i = 0; i < 61; i++) {
      const response = await SELF.fetch(`${BASE}/api/admin/event-year`, { headers: asIp('203.0.113.10') });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 60).every(status => status === 401)).toBe(true);
    expect(statuses[60]).toBe(429);
  });

  it('describes the limit in the 429 response', async () => {
    let response;
    for (let i = 0; i < 61; i++) {
      response = await SELF.fetch(`${BASE}/api/admin/event-year`, { headers: asIp('203.0.113.11') });
    }

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'Too many requests', code: 'too_many_requests' });
    expect(response.headers.get('X-RateLimit-Limit')).toBe('60');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    const retryAfter = Number(response.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('also throttles requests that carry a valid token', async () => {
    let response;
    for (let i = 0; i < 61; i++) {
      response = await SELF.fetch(`${BASE}/api/admin/members`, {
        headers: { ...asIp('203.0.113.12'), Authorization: 'Bearer test-admin-token' }
      });
    }
    expect(response.status).toBe(429);
  });

  it('counts each client IP separately', async () => {
    for (let i = 0; i < 61; i++) {
      await SELF.fetch(`${BASE}/api/admin/event-year`, { headers: asIp('203.0.113.13') });
    }

    const other = await SELF.fetch(`${BASE}/api/admin/event-year`, { headers: asIp('203.0.113.14') });
    expect(other.status).toBe(401);
  });

  it('falls back to the first X-Forwarded-For entry when CF-Connecting-IP is absent', async () => {
    for (let i = 0; i < 61; i++) {
      await SELF.fetch(`${BASE}/api/admin/event-year`, { headers: { 'X-Forwarded-For': '203.0.113.15, 10.0.0.1' } });
    }

    const sameClient = await SELF.fetch(`${BASE}/api/admin/event-year`, { headers: { 'X-Forwarded-For': '203.0.113.15, 10.9.9.9' } });
    expect(sameClient.status).toBe(429);
  });

  it('does not throttle public read endpoints', async () => {
    for (let i = 0; i < 70; i++) {
      const response = await SELF.fetch(`${BASE}/api/config`, { headers: asIp('203.0.113.16') });
      expect(response.status).toBe(200);
    }
  });
});

describe('Team view rate limit (10 attempts / 10 minutes)', () => {
  it('answers 429 on the 11th attempt, for wrong passwords as well as malformed ones', async () => {
    const team = await seedTeam({ password: 'right-password' });
    const headers = asIp('203.0.113.20');

    const statuses = [];
    for (let i = 0; i < 11; i++) {
      const response = await postJson(`/api/teams/${team.id}/view`, i % 2 === 0 ? { password: 'wrong' } : {}, headers);
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 10)).toEqual([403, 400, 403, 400, 403, 400, 403, 400, 403, 400]);
    expect(statuses[10]).toBe(429);
  });

  it('blocks even the correct password once the limit is hit', async () => {
    const team = await seedTeam({ password: 'right-password' });
    const headers = asIp('203.0.113.21');

    for (let i = 0; i < 10; i++) {
      await postJson(`/api/teams/${team.id}/view`, { password: 'wrong' }, headers);
    }

    const response = await postJson(`/api/teams/${team.id}/view`, { password: 'right-password' }, headers);
    expect(response.status).toBe(429);
  });

  it('shares the budget across team ids for one IP', async () => {
    const [a, b] = [await seedTeam(), await seedTeam()];
    const headers = asIp('203.0.113.22');

    for (let i = 0; i < 10; i++) {
      await postJson(`/api/teams/${i % 2 === 0 ? a.id : b.id}/view`, {}, headers);
    }
    const response = await postJson(`/api/teams/${a.id}/view`, {}, headers);
    expect(response.status).toBe(429);
  });

  it('does not limit the public GET of a team nor mix with the register budget', async () => {
    const team = await seedTeam();
    const headers = asIp('203.0.113.23');

    for (let i = 0; i < 12; i++) {
      expect((await SELF.fetch(`${BASE}/api/teams/${team.id}`, { headers })).status).toBe(200);
    }
    for (let i = 0; i < 5; i++) {
      await postJson('/api/register', {}, headers);
    }
    const view = await postJson(`/api/teams/${team.id}/view`, {}, headers);
    expect(view.status).toBe(400);
  });
});

describe('Registration rate limit (5 submissions / 10 minutes)', () => {
  it('counts rejected submissions too', async () => {
    const headers = asIp('203.0.113.30');

    const statuses = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await postJson('/api/register', { members: [] }, headers)).status);
    }

    expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
  });
});

describe('Rate limiting fails open', () => {
  it('lets requests through when the KV namespace errors', async () => {
    vi.spyOn(env.RATE_LIMIT, 'get').mockRejectedValue(new Error('KV unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (let i = 0; i < 8; i++) {
      const response = await postJson('/api/register', { members: [] }, asIp('203.0.113.31'));
      expect(response.status).toBe(400);
    }
  });
});
