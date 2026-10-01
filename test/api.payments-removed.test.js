/**
 * Online payment is gone (everything is paid on site on the day):
 * - the former endpoints are plain 404s (never 400/401/403/500, nothing to probe);
 * - a registration from a stale cached client that still sends `paymentMethod`
 *   succeeds like any other and leaves the payment columns untouched.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import {
  setupSchema, clearAllTables, postJson, adminFetch, register, memberPayload, seedTeam, uniq, BASE
} from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);

describe('removed payment endpoints', () => {
  it.each([
    ['POST', '/api/payment/checkout'],
    ['POST', '/api/payment/verify'],
    ['POST', '/api/payment/delayed'],
    ['POST', '/api/payment/callback'],
    ['GET', '/api/payment/pricing']
  ])('%s %s answers 404', async (method, path) => {
    const response = method === 'GET'
      ? await SELF.fetch(`${BASE}${path}`)
      : await postJson(path, { memberId: 1, checkoutId: 'co-1', teamPassword: 'x' });
    expect(response.status).toBe(404);
  });

  it('answers 404 to the admin as well, and under the site base path', async () => {
    expect((await adminFetch('/api/payment/checkout', { method: 'POST', body: { memberId: 1 } })).status).toBe(404);
    expect((await SELF.fetch(`${BASE}/nuit-de-linfo/api/payment/pricing`)).status).toBe(404);
  });
});

describe('POST /api/register with a stale paymentMethod from an old cached client', () => {
  it.each(['online', 'delayed', 'on_site', 'garbage', '', null, 42, { nested: true }])(
    'accepts paymentMethod %j and ignores it',
    async (paymentMethod) => {
      const response = await register({
        createNewTeam: true,
        teamName: uniq('Stale'),
        teamPassword: 'secret-code',
        paymentMethod,
        members: [memberPayload({ isLeader: true })]
      });
      expect(response.status).toBe(200);
      const { members } = await response.json();

      const row = await env.DB.prepare(
        'SELECT payment_status, payment_method, checkout_id, registration_tier FROM members WHERE id = ?'
      ).bind(members[0].id).first();
      expect(row).toEqual({ payment_status: 'unpaid', payment_method: null, checkout_id: null, registration_tier: null });
    }
  );

  it('also accepts it when joining an existing team', async () => {
    const team = await seedTeam({ password: 'join-code' });
    const response = await register({
      createNewTeam: false,
      teamId: team.id,
      teamPassword: 'join-code',
      paymentMethod: 'online',
      members: [memberPayload()]
    });
    expect(response.status).toBe(200);
  });
});

describe('team secret code wording on the API', () => {
  it('a wrong code is refused with the "code secret" vocabulary, both when joining and when viewing', async () => {
    const team = await seedTeam({ password: 'right-code' });

    const join = await register({
      createNewTeam: false, teamId: team.id, teamPassword: 'wrong-code', members: [memberPayload()]
    });
    expect(join.status).toBe(403);
    expect((await join.json()).error).toBe('Code secret incorrect');

    const view = await postJson(`/api/teams/${team.id}/view`, { password: 'wrong-code' });
    expect(view.status).toBe(403);
    expect((await view.json()).error).toBe('Code secret incorrect');
  });
});
