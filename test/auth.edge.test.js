/**
 * verifyAdminToken (astro-core/auth, used by every admin handler) edge cases: KV override, fail-closed behaviour and malformed
 * Authorization headers. Pure-function cases call verifyAdmin directly with
 * a fake env; the HTTP cases go through the real worker.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { verifyAdminToken as verifyAdmin } from 'astro-core/auth';
import { setupSchema } from './helpers.js';

const BASE = 'http://localhost';

const requestWith = (authorization) =>
  new Request(`${BASE}/api/admin/stats`, authorization === undefined ? {} : { headers: { Authorization: authorization } });

beforeAll(setupSchema);

const kv = (impl) => ({ get: vi.fn(impl) });

afterEach(async () => {
  await env.CONFIG.delete('admin_token');
  vi.restoreAllMocks();
});

describe('verifyAdmin - token sources', () => {
  it('accepts the environment token when there is no KV binding', async () => {
    expect(await verifyAdmin(requestWith('Bearer env-token'), { ADMIN_TOKEN: 'env-token' })).toBe(true);
  });

  it('falls back to the environment token only when KV has no stored token', async () => {
    for (const stored of [null, undefined, '']) {
      const fakeEnv = { ADMIN_TOKEN: 'env-token', CONFIG: kv(async () => stored) };
      expect(await verifyAdmin(requestWith('Bearer env-token'), fakeEnv)).toBe(true);
    }
  });

  it('prefers the KV token over the environment token', async () => {
    const fakeEnv = { ADMIN_TOKEN: 'env-token', CONFIG: kv(async () => 'kv-token') };

    expect(await verifyAdmin(requestWith('Bearer kv-token'), fakeEnv)).toBe(true);
    expect(await verifyAdmin(requestWith('Bearer env-token'), fakeEnv)).toBe(false);
    expect(fakeEnv.CONFIG.get).toHaveBeenCalledWith('admin_token');
  });

  it('fails closed when the KV read rejects, even with a valid environment token', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fakeEnv = { ADMIN_TOKEN: 'env-token', CONFIG: kv(async () => { throw new Error('KV down'); }) };

    expect(await verifyAdmin(requestWith('Bearer env-token'), fakeEnv)).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('fails closed when the KV read throws synchronously', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fakeEnv = { ADMIN_TOKEN: 'env-token', CONFIG: kv(() => { throw new Error('sync boom'); }) };

    expect(await verifyAdmin(requestWith('Bearer env-token'), fakeEnv)).toBe(false);
  });

  it('rejects everything when no token is configured anywhere', async () => {
    expect(await verifyAdmin(requestWith('Bearer anything'), {})).toBe(false);
    expect(await verifyAdmin(requestWith('Bearer anything'), { CONFIG: kv(async () => null) })).toBe(false);
    expect(await verifyAdmin(requestWith('Bearer undefined'), { ADMIN_TOKEN: undefined })).toBe(false);
    expect(await verifyAdmin(requestWith('Bearer '), { ADMIN_TOKEN: '' })).toBe(false);
  });

  it('honours a token stored in the real CONFIG namespace through the worker', async () => {
    await env.CONFIG.put('admin_token', 'kv-override-token');

    const viaKv = await SELF.fetch(`${BASE}/api/admin/event-year`, { headers: { Authorization: 'Bearer kv-override-token' } });
    expect(viaKv.status).toBe(200);

    const viaEnv = await SELF.fetch(`${BASE}/api/admin/event-year`, { headers: { Authorization: 'Bearer test-admin-token' } });
    expect(viaEnv.status).toBe(401);
  });

  it('returns to the environment token once the KV entry is removed', async () => {
    await env.CONFIG.put('admin_token', 'temporary-token');
    await env.CONFIG.delete('admin_token');

    const response = await SELF.fetch(`${BASE}/api/admin/event-year`, { headers: { Authorization: 'Bearer test-admin-token' } });
    expect(response.status).toBe(200);
  });
});

describe('verifyAdmin - Authorization header shapes', () => {
  const fakeEnv = { ADMIN_TOKEN: 'secret-token' };

  it('accepts exactly "Bearer <token>"', async () => {
    expect(await verifyAdmin(requestWith('Bearer secret-token'), fakeEnv)).toBe(true);
  });

  it.each([
    ['no header', undefined],
    ['empty header', ''],
    ['scheme only', 'Bearer'],
    ['scheme and a space, no token', 'Bearer '],
    ['only whitespace after the scheme', 'Bearer    '],
    ['raw token without scheme', 'secret-token'],
    ['Basic scheme', 'Basic secret-token'],
    ['Token scheme', 'Token secret-token'],
    ['lowercase scheme', 'bearer secret-token'],
    ['uppercase scheme', 'BEARER secret-token'],
    ['two spaces after the scheme', 'Bearer  secret-token'],
    ['tab after the scheme', 'Bearer\tsecret-token'],
    ['token with a leading space', 'Bearer  secret-token'],
    ['truncated token', 'Bearer secret-toke'],
    ['token with an extra character', 'Bearer secret-tokens'],
    ['token with a different case', 'Bearer Secret-Token'],
    ['token followed by another token', 'Bearer secret-token other'],
    ['comma-joined tokens', 'Bearer wrong, Bearer secret-token']
  ])('rejects %s', async (_label, header) => {
    expect(await verifyAdmin(requestWith(header), fakeEnv)).toBe(false);
  });

  it('rejects a 200 KB token without throwing', async () => {
    const huge = 'a'.repeat(200_000);
    expect(await verifyAdmin(requestWith(`Bearer ${huge}`), fakeEnv)).toBe(false);
  });

  it('accepts a very long configured token only when it matches in full', async () => {
    const long = 'L'.repeat(5000);
    expect(await verifyAdmin(requestWith(`Bearer ${long}`), { ADMIN_TOKEN: long })).toBe(true);
    expect(await verifyAdmin(requestWith(`Bearer ${long.slice(1)}`), { ADMIN_TOKEN: long })).toBe(false);
    expect(await verifyAdmin(requestWith(`Bearer ${long}L`), { ADMIN_TOKEN: long })).toBe(false);
  });

  it('compares non-ASCII (Latin-1) tokens exactly', async () => {
    const token = 'tökén-ñandú';
    expect(await verifyAdmin(requestWith(`Bearer ${token}`), { ADMIN_TOKEN: token })).toBe(true);
    expect(await verifyAdmin(requestWith('Bearer token-nandu'), { ADMIN_TOKEN: token })).toBe(false);
    // the NFD form of the same text is a different token
    expect(await verifyAdmin(requestWith(`Bearer ${token.normalize('NFD')}`), { ADMIN_TOKEN: token })).toBe(false);
  });

  it('compares tokens that only differ in the first or last byte as different', async () => {
    expect(await verifyAdmin(requestWith('Bearer xecret-token'), fakeEnv)).toBe(false);
    expect(await verifyAdmin(requestWith('Bearer secret-tokex'), fakeEnv)).toBe(false);
  });

  it('does not accept a token from the URL or a cookie', async () => {
    const byQuery = await SELF.fetch(`${BASE}/api/admin/event-year?token=test-admin-token&Authorization=Bearer%20test-admin-token`);
    expect(byQuery.status).toBe(401);

    const byCookie = await SELF.fetch(`${BASE}/api/admin/event-year`, { headers: { Cookie: 'ndi_admin_token=test-admin-token' } });
    expect(byCookie.status).toBe(401);
  });
});

describe('verifyAdmin through the worker', () => {
  it('answers a JSON 401 for hostile Authorization headers, never a 5xx', async () => {
    for (const header of ['Bearer ' + 'a'.repeat(8000), 'Bearer éèê', 'Bearer ', 'Bearer', 'Bearer null', 'Bearer undefined']) {
      const response = await SELF.fetch(`${BASE}/api/admin/event-year`, { headers: { Authorization: header } });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Non autorisé', code: 'unauthorized' });
    }
  });
});
