/**
 * Platform wiring: CORS on every API response (router errors included), the
 * admin guard installed by createRouter() and the rate-limit rules.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { json } from 'astro-core/router';
import { createRouter } from '../src/routes.js';
import { setupSchema, clearAllTables, postJson, adminFetch, ADMIN_HEADERS, JSON_HEADERS, BASE } from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);

/** A client address of the 198.18.0.0/15 benchmarking range (never a real client). */
const testIp = (group, host) => ['198', '18', group, host].join('.');

const PRODUCTION = 'https://asso.info-evry.fr';
const NDI_SUBDOMAIN = 'https://ndi.asso.info-evry.fr';

const fetchFrom = (path, { origin, ip = testIp(0, 1), ...init } = {}) => SELF.fetch(`${BASE}${path}`, {
  ...init,
  headers: { ...JSON_HEADERS, 'CF-Connecting-IP': ip, ...(origin ? { Origin: origin } : {}), ...init.headers }
});

describe('CORS on every response (api-route)', () => {
  it.each([
    ['a router 404', '/api/nope', {}, 404],
    ['an admin 401 (guard)', '/api/admin/stats', {}, 401],
    ['a 413 (body above the router limit)', '/api/register', { method: 'POST', body: JSON.stringify({ x: 'x'.repeat(1_100_000) }) }, 413],
    ['a handler 400', '/api/register', { method: 'POST', body: '{nope' }, 400],
    ['a 200', '/api/config', {}, 200]
  ])('adds the allow-list headers to %s', async (_label, path, init, status) => {
    const response = await fetchFrom(path, { origin: NDI_SUBDOMAIN, ...init });
    expect(response.status).toBe(status);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(NDI_SUBDOMAIN);
    expect(response.headers.get('Vary')).toContain('Origin');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('adds them to a 429 as well', async () => {
    let last;
    for (let i = 0; i < 11; i++) {
      last = await fetchFrom('/api/teams/1/view', { origin: NDI_SUBDOMAIN, method: 'POST', body: '{}', ip: testIp(7, 7) });
    }
    expect(last.status).toBe(429);
    expect(last.headers.get('Access-Control-Allow-Origin')).toBe(NDI_SUBDOMAIN);
    expect((await last.json()).code).toBe('too_many_requests');
  });

  it('never reflects an unknown origin: it falls back to the first allowed one', async () => {
    const response = await fetchFrom('/api/nope', { origin: 'https://evil.example' });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(PRODUCTION);
  });

  it('answers a preflight with a 204 and the CORS headers', async () => {
    const response = await fetchFrom('/api/admin/members', { origin: 'http://localhost:4321', method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4321');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
  });
});

describe('createRouter(): the admin guard and the rate-limit rules', () => {
  it('guards /api/admin even for a handler that forgot adminOnly', async () => {
    const router = createRouter();
    router.get('/api/admin/forgotten', () => json({ leaked: true }));
    router.get('/api/administrator', () => json({ public: true }));

    const anonymous = await router.handle(new Request(`${BASE}/nuit-de-linfo/api/admin/forgotten`), env);
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ error: 'Non autorisé', code: 'unauthorized' });

    const authorized = await router.handle(
      new Request(`${BASE}/nuit-de-linfo/api/admin/forgotten`, { headers: ADMIN_HEADERS }), env
    );
    expect(await authorized.json()).toEqual({ leaked: true });

    // the guard matches whole path segments: /api/administrator is not under /api/admin
    const sibling = await router.handle(new Request(`${BASE}/nuit-de-linfo/api/administrator`), env);
    expect(await sibling.json()).toEqual({ public: true });
  });

  it('rate-limit prefixes match whole path segments (/api/registerX is not /api/register)', async () => {
    for (let i = 0; i < 8; i++) {
      const response = await postJson('/api/registerX', {}, { 'CF-Connecting-IP': testIp(9, 9) });
      expect(response.status).toBe(404);
    }
  });

  it('has no rate-limit rule for the removed payment endpoints (they are plain 404s)', async () => {
    const headers = { 'CF-Connecting-IP': testIp(8, 8) };
    for (let i = 0; i < 25; i++) {
      expect((await postJson('/api/payment/verify', {}, headers)).status).toBe(404);
    }
  });
});

describe('admin settings: price cap', () => {
  it('refuses a price above the payment cap', async () => {
    expect((await adminFetch('/api/admin/settings', { method: 'PUT', body: { price_late: 100_001 } })).status).toBe(400);
    expect((await adminFetch('/api/admin/settings', { method: 'PUT', body: { price_late: 100_000 } })).status).toBe(200);
  });
});

describe('admin page', () => {
  it('renders the settings defaults from the shared constants', async () => {
    const response = await SELF.fetch(`${BASE}/nuit-de-linfo/admin`);
    expect(response.status).toBe(200);
    const html = await response.text();

    expect(html).toMatch(/id="setting-price-asso-member"[^>]*value="5.00"/);
    expect(html).toMatch(/id="setting-price-late"[^>]*value="10.00"/);
    expect(html).toMatch(/id="setting-late-cutoff"[^>]*value="19:00"/);
    expect(html).toMatch(/id="setting-max-team"[^>]*value="15"/);
    expect(html).toMatch(/id="setting-max-participants"[^>]*value="200"/);
    expect(html).toMatch(/id="setting-gdpr-retention"[^>]*value="3"/);
    // No online payment settings any more
    expect(html).not.toMatch(/setting-(payment-enabled|price-tier|tier1-cutoff-days|registration-deadline)/);
    expect(html).toMatch(/id="setting-school-name"[^>]*value="Université d&#39;Evry"|id="setting-school-name"[^>]*value="Université d'Evry"/);
  });
});
