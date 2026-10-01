/**
 * Public API hardening regressions
 *
 * - GET /api/teams/:id must stay a public, PII-free endpoint
 * - unknown paths must answer 404 (never 500): the worker once crashed on
 *   them because the ASSETS binding was missing
 * - malformed / non-object JSON bodies on public endpoints answer 400
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { setupSchema, clearAllTables, seedTeam, uniq, postJson, BASE } from './helpers.js';

beforeAll(setupSchema);
beforeEach(clearAllTables);

describe('GET /api/teams/:id - public team info', () => {
  it('returns only public fields plus member_count', async () => {
    const team = await seedTeam({ members: 3, description: 'Public description' });

    const response = await SELF.fetch(`${BASE}/api/teams/${team.id}`);
    expect(response.status).toBe(200);

    const { team: body } = await response.json();
    expect(Object.keys(body).sort()).toEqual(
      ['created_at', 'description', 'id', 'is_organisation', 'member_count', 'name', 'room'].sort()
    );
    expect(body.id).toBe(team.id);
    expect(body.name).toBe(team.name);
    expect(body.description).toBe('Public description');
    expect(body.member_count).toBe(3);
    expect(body.is_organisation).toBe(false);
  });

  it('never leaks password hash, member emails, payment ids or the members list', async () => {
    const team = await seedTeam({ members: 2 });
    const hash = (await env.DB.prepare('SELECT password_hash FROM teams WHERE id = ?').bind(team.id).first()).password_hash;
    const email = (await env.DB.prepare('SELECT email FROM members WHERE id = ?').bind(team.memberIds[0]).first()).email;
    const checkoutId = uniq('checkout-secret-');
    const transactionId = uniq('txn-secret-');
    await env.DB.prepare('UPDATE members SET checkout_id = ?, transaction_id = ? WHERE id = ?')
      .bind(checkoutId, transactionId, team.memberIds[0]).run();

    const response = await SELF.fetch(`${BASE}/api/teams/${team.id}`);
    const text = await response.text();
    const { team: body } = JSON.parse(text);

    expect(body).not.toHaveProperty('members');
    expect(body).not.toHaveProperty('password_hash');
    expect(text).not.toContain(hash);
    expect(text).not.toContain(hash.split(':')[0]);
    expect(text).not.toContain(email);
    expect(text).not.toContain(checkoutId);
    expect(text).not.toContain(transactionId);
    expect(text).not.toMatch(/email|checkout|transaction|payment|password/i);
  });

  it('does not expose a legacy SHA-256 hash either', async () => {
    const legacyHash = 'a'.repeat(64);
    const team = await seedTeam({ passwordHash: legacyHash });

    const text = await (await SELF.fetch(`${BASE}/api/teams/${team.id}`)).text();
    expect(text).not.toContain(legacyHash);
  });

  it('returns 404 for an unknown id', async () => {
    const response = await SELF.fetch(`${BASE}/api/teams/987654321`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Équipe introuvable', code: 'not_found' });
  });

  it.each(['abc', '1.5', '-1', '0', '99999999999999999999', '%F0%9F%A5'])(
    'returns 400 invalid_id (not 500) for the non-id value %s',
    async (id) => {
      const response = await SELF.fetch(`${BASE}/api/teams/${id}`);
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('invalid_id');
    }
  );

  it('flags the Organisation team and reports a zero member_count for an empty team', async () => {
    const org = await seedTeam({ name: 'Organisation', password: '', members: 0 });

    const { team } = await (await SELF.fetch(`${BASE}/api/teams/${org.id}`)).json();
    expect(team.is_organisation).toBe(true);
    expect(team.member_count).toBe(0);
  });

  it('reports the room when one is assigned', async () => {
    const team = await seedTeam();
    await env.DB.prepare('UPDATE teams SET room = ? WHERE id = ?').bind('Salle 42', team.id).run();

    const { team: body } = await (await SELF.fetch(`${BASE}/api/teams/${team.id}`)).json();
    expect(body.room).toBe('Salle 42');
  });
});

describe('GET /api/teams - listing', () => {
  it('never includes password hashes or member details', async () => {
    const team = await seedTeam({ members: 2 });
    const hash = (await env.DB.prepare('SELECT password_hash FROM teams WHERE id = ?').bind(team.id).first()).password_hash;

    const text = await (await SELF.fetch(`${BASE}/api/teams`)).text();
    expect(text).not.toContain(hash);
    expect(text).not.toMatch(/password|@example\.com/i);

    const { teams } = JSON.parse(text);
    const listed = teams.find(t => t.id === team.id);
    expect(listed.member_count).toBe(2);
  });
});

describe('Unknown paths answer 404, never 500', () => {
  it.each([
    '/nonexistent',
    '/a/b/c/d/e/f/g',
    '/admin/nope',
    '/api/nope',
    '/api/',
    '/api/teams/1/nope',
    '/_astro/missing-asset.js',
    '/nuit-de-linfo/nonexistent',
    '/nuit-de-linfo/api/nope',
    '/%E2%9C%93/%F0%9F%A6%84/%C3%A9',
    '/a/%2e%2e/%2e%2e/etc/passwd',
    '/..%2f..%2fetc/passwd',
    '/api/%E2%9C%93',
    '/api/%ZZ',
    '/%ZZ',
    '/nonexistent?x=%ZZ&y=<script>',
    `/${'long-segment/'.repeat(100)}end`
  ])('GET %s', async (path) => {
    const response = await SELF.fetch(`${BASE}${path}`);
    expect(response.status).toBe(404);
  });

  it('answers 401 under /api/admin without a token (admin guard) and 404 with one', async () => {
    const anonymous = await SELF.fetch(`${BASE}/api/admin/nope`);
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ error: 'Non autorisé', code: 'unauthorized' });

    const admin = await SELF.fetch(`${BASE}/api/admin/nope`, { headers: { Authorization: 'Bearer test-admin-token' } });
    expect(admin.status).toBe(404);
    expect((await admin.json()).code).toBe('not_found');
  });

  it('returns a JSON error body for unknown API routes', async () => {
    const response = await SELF.fetch(`${BASE}/api/nope`);
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(await response.json()).toHaveProperty('error');
  });

  it.each(['POST', 'PUT', 'DELETE'])('%s on an unknown API route is a 404', async (method) => {
    const response = await SELF.fetch(`${BASE}/api/nope`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'DELETE' ? undefined : '{}'
    });
    expect(response.status).toBe(404);
  });

  it('answers 404 for a known path with the wrong method', async () => {
    const response = await SELF.fetch(`${BASE}/api/teams`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status).toBe(404);
  });

  it('answers non-API unknown paths with a 404 for other methods too', async () => {
    const response = await SELF.fetch(`${BASE}/nonexistent`, { method: 'POST', body: '{}' });
    expect(response.status).toBeLessThan(500);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('serves the admin page and the home page', async () => {
    for (const path of ['/', '/admin']) {
      const response = await SELF.fetch(`${BASE}${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('text/html');
    }
  });

  it('answers CORS preflight with 204 and never reflects an unknown origin', async () => {
    const response = await SELF.fetch(`${BASE}/api/teams`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' }
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('https://evil.example');
  });

  it('echoes only whitelisted origins on API responses', async () => {
    const allowed = await SELF.fetch(`${BASE}/api/config`, { headers: { Origin: 'https://asso.info-evry.fr' } });
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://asso.info-evry.fr');

    const denied = await SELF.fetch(`${BASE}/api/config`, { headers: { Origin: 'https://evil.example' } });
    expect(denied.headers.get('Access-Control-Allow-Origin')).not.toBe('https://evil.example');
  });
});

describe('Malformed JSON bodies on public endpoints answer 400', () => {
  let teamId;
  beforeEach(async () => {
    teamId = (await seedTeam()).id;
  });

  it.each([
    ['register', () => '/api/register'],
    ['team view', () => `/api/teams/${teamId}/view`]
  ])('%s rejects a syntactically invalid body', async (_label, path) => {
    const response = await postJson(path(), '{not valid json');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Corps de requête invalide', code: 'invalid_body' });
  });

  it.each([
    ['register', () => '/api/register'],
    ['team view', () => `/api/teams/${teamId}/view`]
  ])('%s rejects null / array / scalar bodies', async (_label, path) => {
    for (const body of ['null', '[]', '42', '"text"']) {
      const response = await postJson(path(), body);
      expect(response.status).toBe(400);
    }
  });

  it('register rejects an empty body', async () => {
    const response = await SELF.fetch(`${BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status).toBe(400);
  });

  it('register answers 400 when a member entry is not an object', async () => {
    for (const [index, members] of [[null], [42], ['text'], [[]]].entries()) {
      const response = await postJson('/api/register', {
        createNewTeam: true,
        teamName: uniq('Bad'),
        teamPassword: 'secret',
        members
      }, { 'CF-Connecting-IP': `203.0.113.${index + 1}` });
      expect(response.status).toBe(400);
    }
  });
});
